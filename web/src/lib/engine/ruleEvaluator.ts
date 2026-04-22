import { Product, Rule } from '@prisma/client'

export interface EvaluationTrace {
    ruleId: string
    ruleType: string
    priority: number
    condition: string
    passed: boolean
    actionTaken?: string
    payload?: string
}

export interface RuleEngineResult {
    finalNameEs: string
    finalNameEn: string
    activeIcons: string[]
    trace: EvaluationTrace[]
    activeVariableIds: string[] // Tracking which fields were used in the final name
    transformedProduct: Product // Returned to show modified attributes (e.g. rh_flag)
}

/**
 * Safely evaluates a simple boolean condition expression against product data.
 */
function evaluateCondition(expression: string, product: Product): boolean {
    try {
        // Support AND conditions with &&
        const parts = expression.replace(/ /g, '').split('&&')
        
        return parts.every(expr => {
            if (expr.includes('!=null')) {
                const field = expr.split('!=null')[0].toLowerCase() as keyof Product
                const val = product[field]
                // 'NA' means "No Aplica" — treat as falsy (omit from name)
                return val !== null && val !== undefined && val !== '' && String(val).trim().toUpperCase() !== 'NA'
            }

            if (expr.includes('==true')) {
                const field = expr.split('==true')[0].toLowerCase() as keyof Product
                return product[field] === true
            }

            if (expr.includes('==false')) {
                const field = expr.split('==false')[0].toLowerCase() as keyof Product
                return product[field] === false
            }

            if (expr.includes('==')) {
                const [fieldRaw, valRaw] = expr.split('==') 
                const field = fieldRaw.toLowerCase() as keyof Product
                const val = valRaw.replace(/['"]/g, '') 
                return String(product[field]) === val
            }
            
            return false
        })
    } catch (e) {
        console.warn(`Failed to evaluate condition: ${expression}`, e)
        return false
    }
}

function hydratePayload(payload: string, product: Product): string {
    return payload.replace(/{([^}]+)}/g, (_, field) => {
        const value = product[field.toLowerCase() as keyof Product]
        return value ? String(value) : ''
    })
}

/**
 * Evaluates a set of rules against a product to determine its final name and active icons.
 * Version 2: Supports 'attribute_modifier' ruleType to update product state before naming.
 */
export function evaluateProductRules(product: Product, rules: Rule[]): RuleEngineResult {
    const result: RuleEngineResult = {
        finalNameEs: '',
        finalNameEn: '',
        activeIcons: [],
        trace: [],
        activeVariableIds: [],
        transformedProduct: { ...product } 
    }

    const sortedRules = [...rules]
        .filter(r => r.enabled)
        .filter((r: any) => {
            // Filter by product type if the rule is specific to one
            if (r.target_entity && r.target_entity !== 'product' && r.rule_type === 'name_component') {
                const requiredType = r.target_entity.trim().toUpperCase()
                const productType = String(result.transformedProduct.product_type || '').trim().toUpperCase()
                
                // Fallback: if productType is empty, assume it matches 'MUEBLE' rules (system base)
                if (productType === '' && requiredType === 'MUEBLE') return true
                
                return requiredType === productType
            }
            return true
        })
        .sort((a, b) => a.priority - b.priority)

    // STAGE 1: Attribute Modifiers (Prioritize Version Logic, etc.)
    for (const rule of sortedRules) {
        if (rule.rule_type !== 'attribute_modifier') continue

        const passed = evaluateCondition(rule.condition_expression, result.transformedProduct)
        
        const traceRecord: EvaluationTrace = {
            ruleId: rule.id,
            ruleType: rule.rule_type,
            priority: rule.priority,
            condition: rule.condition_expression,
            passed
        }

        if (passed && rule.action_type === 'set_attribute') {
            const [field, rawValue] = rule.action_payload.split(':') as [keyof Product, string]
            let value: any = rawValue.trim()
            
            const isNum = /^-?\d+\.?\d*$/.test(value);
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (isNum) value = +value;
            
            // Apply modification to product working copy
            (result.transformedProduct as any)[field] = value;
            
            traceRecord.actionTaken = 'set_attribute'
            traceRecord.payload = `${field}:${value}`
        }

        result.trace.push(traceRecord)
    }

    // STAGE 2: Name & Icons (Using the potentially modified product)
    const nameComponents: string[] = []

    for (const rule of sortedRules) {
        if (rule.rule_type === 'attribute_modifier') continue

        const passed = evaluateCondition(rule.condition_expression, result.transformedProduct)

        const traceRecord: EvaluationTrace = {
            ruleId: rule.id,
            ruleType: rule.rule_type,
            priority: rule.priority,
            condition: rule.condition_expression,
            passed
        }

        if (passed) {
            if (rule.rule_type === 'name_component' && rule.action_type === 'append_text') {
                const textToAppend = hydratePayload(rule.action_payload, result.transformedProduct)
                if (textToAppend.trim() !== '') {
                    nameComponents.push(textToAppend.trim())
                    traceRecord.actionTaken = 'appended_name_component'
                    traceRecord.payload = textToAppend.trim()

                    // Extract variable IDs from action_payload (e.g., {cabinet_name})
                    const matches = rule.action_payload.match(/{([^}]+)}/g)
                    if (matches) {
                        matches.forEach(m => {
                            const field = m.replace(/[{}]/g, '')
                            if (!result.activeVariableIds.includes(field)) {
                                result.activeVariableIds.push(field)
                            }
                        })
                    }

                    // Extract variable IDs from condition_expression (for fixed text components)
                    // e.g. "rh_flag == true" -> it uses 'rh' conceptually
                    const condTokens = rule.condition_expression.split(/[&|!=\s<>]+/).filter(Boolean)
                    condTokens.forEach(t => {
                        // Check if t is a likely field name (not a keyword or literal)
                        if (t !== 'true' && t !== 'false' && t !== 'null' && isNaN(Number(t))) {
                            if (!result.activeVariableIds.includes(t)) {
                                result.activeVariableIds.push(t)
                            }
                        }
                    })
                }
            }

            if (rule.rule_type === 'icon_activation' && rule.action_type === 'activate_icon') {
                const iconName = hydratePayload(rule.action_payload, result.transformedProduct)
                if (iconName.trim() !== '' && !result.activeIcons.includes(iconName)) {
                    result.activeIcons.push(iconName.trim())
                    traceRecord.actionTaken = 'activated_icon'
                    traceRecord.payload = iconName.trim()
                }
            }
        }

        result.trace.push(traceRecord)
    }

    result.finalNameEs = nameComponents.join(' ')

    return result
}
