
function evaluateCondition(expression: string, product: any): boolean {
    try {
        const parts = expression.replace(/ /g, '').split('&&')
        return parts.every(expr => {
            if (expr.includes('!=null')) {
                const field = expr.split('!=null')[0].toLowerCase()
                const val = product[field]
                return val !== null && val !== undefined && val !== '' && String(val).trim().toUpperCase() !== 'NA'
            }
            if (expr.includes('==true')) {
                const field = expr.split('==true')[0].toLowerCase()
                return product[field] === true
            }
            if (expr.includes('==')) {
                const [fieldRaw, valRaw] = expr.split('==') 
                const field = fieldRaw.toLowerCase()
                const val = valRaw.replace(/['"]/g, '') 
                return String(product[field]) === val
            }
            return false
        })
    } catch (e) {
        return false
    }
}

function hydratePayload(payload: string, product: any): string {
    return payload.replace(/{([^}]+)}/g, (_, field) => {
        const value = product[field.toLowerCase()]
        return value ? String(value) : ''
    })
}

function evaluateProductRules(product: any, rules: any[]): any {
    const sortedRules = [...rules]
        .filter(r => r.enabled)
        .sort((a, b) => a.priority - b.priority)

    const nameComponents: string[] = []

    for (const rule of sortedRules) {
        const passed = evaluateCondition(rule.condition_expression, product)
        if (passed) {
            if (rule.rule_type === 'name_component' && rule.action_type === 'append_text') {
                const textToAppend = hydratePayload(rule.action_payload, product)
                if (textToAppend.trim() !== '') {
                    nameComponents.push(textToAppend.trim())
                }
            }
        }
    }
    return { finalNameEs: nameComponents.join(' ') }
}

const mockProduct: any = {
    product_type: 'MUEBLE',
    designation: 'INFERIOR',
    cabinet_name: 'VIVE',
    line: 'NA',
    use_destination: 'COCINA',
    commercial_measure: '150X55',
    accessory_text: 'CON MANIJAS 4P',
    canto_puertas: 'CANTO 2 MM',
    door_color_text: 'NA',
    rh_flag: false,
    assembled_flag: false,
    carb2: 'NA'
};

const mockRules: any[] = [
    { id: '1', priority: 10, rule_type: 'name_component', target_entity: 'product', condition_expression: 'product_type != null', action_type: 'append_text', action_payload: '{product_type}', enabled: true },
    { id: '2', priority: 20, rule_type: 'name_component', target_entity: 'product', condition_expression: 'designation != null', action_type: 'append_text', action_payload: '{designation}', enabled: true },
    { id: '3', priority: 30, rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'cabinet_name != null', action_type: 'append_text', action_payload: '{cabinet_name}', enabled: true },
    { id: '4', priority: 50, rule_type: 'name_component', target_entity: 'product', condition_expression: 'use_destination != null', action_type: 'append_text', action_payload: 'PARA {use_destination}', enabled: true },
    { id: '5', priority: 60, rule_type: 'name_component', target_entity: 'product', condition_expression: 'commercial_measure != null', action_type: 'append_text', action_payload: '{commercial_measure}', enabled: true },
    { id: '6', priority: 70, rule_type: 'name_component', target_entity: 'product', condition_expression: 'accessory_text != null', action_type: 'append_text', action_payload: '{accessory_text}', enabled: true },
    { id: '7', priority: 80, rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'canto_puertas != null', action_type: 'append_text', action_payload: '{canto_puertas}', enabled: true }
];

const result = evaluateProductRules(mockProduct, mockRules);
console.log('Final Name ES:', result.finalNameEs);
