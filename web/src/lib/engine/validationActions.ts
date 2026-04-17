import { dbQuery } from '@/lib/supabase'
import { validateProductReadiness, ValidationIssues } from './validator'
import { TemplateElement } from '@/components/templates/TemplateCanvas'

export interface ExceptionSummary {
    totalActiveProducts: number
    exceptionsCount: number
    incompleteProductsCount: number
    details: {
        productId: string
        productCode: string
        productName: string
        issues: ValidationIssues
    }[]
}

/**
 * Executes a full validation sweep of the active product catalog.
 * This is the single source of truth for the "Bandeja de Excepciones".
 */
export async function getFullValidationSweep(): Promise<ExceptionSummary> {
    // 1. Fetch dependencies
    const products = await dbQuery(`
        SELECT * FROM public.cabinet_products 
        WHERE status IS NULL OR status != 'INACTIVO'
        ORDER BY updated_at DESC
    `) || []
    
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`) || []
    
    const activeTemplates = await dbQuery(`
        SELECT id, name, elements_json 
        FROM public.plantillas_doc_tec 
        WHERE active = true
    `) || []

    // 2. Consolidate all required elements from all active templates
    const allRequiredElements: TemplateElement[] = []
    activeTemplates.forEach((t: any) => {
        try {
            const elements = JSON.parse(t.elements_json || '[]')
            allRequiredElements.push(...elements)
        } catch (e) {
            console.error(`Error parsing elements for template ${t.id}:`, e)
        }
    })

    // 3. Run validation
    const details: ExceptionSummary['details'] = []
    let exceptionsCount = 0
    let incompleteProductsCount = 0

    const results = products.map((p: any) => {
        const issues = validateProductReadiness(p, rules, allRequiredElements)
        
        // Match with database expectation if we want to cross-check
        if (p.validation_status === 'incomplete') {
            incompleteProductsCount++
        }

        if (!issues.isValid || issues.warnings.length > 0) {
            exceptionsCount++
            details.push({
                productId: p.id,
                productCode: p.code,
                productName: p.final_name_es || 'Sin nombre',
                issues
            })
        }
        
        return { product: p, issues }
    })

    return {
        totalActiveProducts: products.length,
        exceptionsCount,
        incompleteProductsCount,
        details
    }
}

/**
 * Persists the validation status to the database for all active products.
 * Use this to keep the 'validation_status' column in sync with current rules and templates.
 */
export async function syncValidationStatus(): Promise<{ updated: number }> {
    const sweep = await getFullValidationSweep()
    
    // We update in batches or individual queries since Supabase RPC/Bulk update is safer for this
    let updated = 0
    
    // 1. Reset all products to 'ready' first (optimistic) then mark exceptions
    // Or better, iterate through sweep results
    
    // Get all product IDs to handle 'ready' state
    const allProducts = await dbQuery(`SELECT id FROM public.cabinet_products WHERE status IS NULL OR status != 'INACTIVO'`) || []
    
    // Create a map of exceptions for fast lookup
    const exceptionMap = new Map(sweep.details.map(d => [d.productId, d.issues]))
    
    for (const p of allProducts) {
        const issues = exceptionMap.get(p.id)
        let newStatus = 'ready'
        
        if (issues) {
            newStatus = issues.isValid ? 'needs_review' : 'incomplete'
        }
        
        await dbQuery(`
            UPDATE public.cabinet_products 
            SET validation_status = '${newStatus}', updated_at = now()
            WHERE id = '${p.id}'
        `)
        updated++
    }

    return { updated }
}
