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
    activeIcons: string[]
    trace: EvaluationTrace[]
}

/**
 * Safely evaluates a simple boolean condition expression against product data.
 * Does not use direct `eval` for exact security, but parses simple `field == value` logic
 * tailored to our MVP constraints.
 */
function evaluateCondition(expression: string, product: Product): boolean {
    try {
        // Very naive parser forMVP: "field == value" or "field != null" or "field == true"
        // e.g., "rh_flag == true", "product_type != null"

        // Quick normalize
        let expr = expression.replace(/ /g, '')

        // Check for != null
        if (expr.includes('!=null')) {
            const field = expr.split('!=null')[0] as keyof Product
            return product[field] !== null && product[field] !== undefined && product[field] !== ''
        }

        // Check for == true
        if (expr.includes('==true')) {
            const field = expr.split('==true')[0] as keyof Product
            return product[field] === true
        }

        // Check for == false
        if (expr.includes('==false')) {
            const field = expr.split('==false')[0] as keyof Product
            return product[field] === false
        }

        // Check string equality (e.g. field=='MUEBLE')
        if (expr.includes('==')) {
            const [field, valRaw] = expr.split('==') as [keyof Product, string]
            const val = valRaw.replace(/['"]/g, '') // remove quotes
            return String(product[field]) === val
        }

        return false
    } catch (e) {
        console.warn(`Failed to evaluate condition: ${expression}`, e)
        return false
    }
}

/**
 * Replaces {field} placeholders with actual product values.
 */
function hydratePayload(payload: string, product: Product): string {
    return payload.replace(/{([^}]+)}/g, (_, field) => {
        const value = product[field as keyof Product]
        return value ? String(value) : ''
    })
}

/**
 * Evaluates a set of rules against a product to determine its final name and active icons.
 */
export function evaluateProductRules(product: Product, rules: Rule[]): RuleEngineResult {
    const result: RuleEngineResult = {
        finalNameEs: '',
        activeIcons: [],
        trace: []
    }

    // Sort rules by priority (lower number = higher priority/first to execute)
    const sortedRules = [...rules].filter(r => r.enabled).sort((a, b) => a.priority - b.priority)

    const nameComponents: string[] = []

    for (const rule of sortedRules) {
        const passed = evaluateCondition(rule.condition_expression, product)

        const traceRecord: EvaluationTrace = {
            ruleId: rule.id,
            ruleType: rule.rule_type,
            priority: rule.priority,
            condition: rule.condition_expression,
            passed
        }

        if (passed) {
            if (rule.rule_type === 'name_component' && rule.action_type === 'append_text') {
                const textToAppend = hydratePayload(rule.action_payload, product)
                if (textToAppend.trim() !== '') {
                    nameComponents.push(textToAppend.trim())
                    traceRecord.actionTaken = 'appended_name_component'
                    traceRecord.payload = textToAppend.trim()
                }
            }

            if (rule.rule_type === 'icon_activation' && rule.action_type === 'activate_icon') {
                const iconName = hydratePayload(rule.action_payload, product)
                if (iconName.trim() !== '' && !result.activeIcons.includes(iconName)) {
                    result.activeIcons.push(iconName.trim())
                    traceRecord.actionTaken = 'activated_icon'
                    traceRecord.payload = iconName.trim()
                }
            }
        }

        result.trace.push(traceRecord)
    }

    // Assemble final name
    result.finalNameEs = nameComponents.join(' ')

    return result
}
