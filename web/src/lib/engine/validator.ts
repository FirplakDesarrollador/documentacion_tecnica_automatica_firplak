import { Product, Rule } from '@prisma/client'
import { evaluateProductRules } from './ruleEvaluator'
import { TemplateElement } from '@/components/templates/TemplateCanvas'

export interface ValidationIssues {
    isValid: boolean
    missingFields: string[]
    failedRules: string[]
    warnings: string[]
}

/**
 * Validates a product to ensure it has all data required to generate its final label.
 * This checks against the active templates to see what variables they expect,
 * and ensures those variables are not empty after rule evaluations.
 */
export function validateProductReadiness(
    product: any, // Use any to allow flexible database objects
    rules: Rule[],
    templates: TemplateElement[]
): ValidationIssues {

    const issues: ValidationIssues = {
        isValid: true,
        missingFields: [],
        failedRules: [],
        warnings: []
    }

    // 0. Filter by Status: Inactive products are not evaluated as exceptions
    if (product.status === 'INACTIVO') {
        return issues
    }

    // 1. Evaluate rules for derived fields
    const ruleResults = evaluateProductRules(product as Product, rules)

    // 2. Extrapolate what data fields our templates actually bind to and mark as REQUIRED
    const requiredDataFields = new Set<string>()
    templates.forEach(el => {
        // If the element is marked as required in the template builder, we must validate it
        if (el.required) {
            if ((el.type === 'dynamic_text' || el.type === 'barcode' || el.type === 'dynamic_image') && el.dataField) {
                requiredDataFields.add(el.dataField)
            }
            // Special case: Static image placeholder used for isometrics
            if (el.type === 'image' && el.content === 'Isométrico') {
                requiredDataFields.add('isometric')
            }
        }
    })

    // 3. Verify all required fields are satisfied 
    requiredDataFields.forEach(field => {
        let value: any = undefined

        // Resolve value from product or rules
        if (field === 'final_name_es') value = ruleResults.finalNameEs
        else if (field === 'final_name_en') value = ruleResults.finalNameEn
        // Handle isometric/attachments
        else if (field === 'isometric') {
            value = product.isometric_asset_id || product.isometric_path
        }
        else value = product[field as keyof Product]

        if (value === null || value === undefined || value === '') {
            issues.missingFields.push(field)
        }
    })

    // 4. Determine final validity
    if (issues.missingFields.length > 0) {
        issues.isValid = false
    }

    // Optional: Add warning if product type is unknown since that drives most rules
    if (!product.product_type) {
        issues.warnings.push('product_type is empty. Rules might not evaluate correctly.')
    }

    return issues
}
