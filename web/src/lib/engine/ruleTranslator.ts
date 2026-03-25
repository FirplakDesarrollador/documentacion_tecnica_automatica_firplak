/**
 * Traduce una regla técnica a lenguaje natural en español.
 */
export function ruleToSpanishDescription(rule: any): string {
    if (!rule) return 'Sin descripción'

    let condition = ''
    try {
        // Formato esperado de condition_expression: "field == 'value'" o "field.includes('value')"
        const expr = rule.condition_expression || ''
        if (expr.includes('==')) {
            const [field, val] = expr.split('==').map((s: string) => s.trim().replace(/'/g, ''))
            condition = `Si el campo **${translateField(field)}** es igual a **"${val}"**`
        } else if (expr.includes('!=')) {
            const [field, val] = expr.split('!=').map((s: string) => s.trim().replace(/'/g, ''))
            condition = `Si el campo **${translateField(field)}** NO es igual a **"${val}"**`
        } else if (expr.includes('.includes')) {
            const field = expr.split('.')[0]
            const val = expr.match(/'([^']+)'/)?.[1] || ''
            condition = `Si el campo **${translateField(field)}** contiene **"${val}"**`
        } else {
            condition = `Si se cumple la condición: "${expr}"`
        }
    } catch (e) {
        condition = `Si [error en condición]`
    }

    let action = ''
    try {
        const type = rule.action_type
        const payload = rule.action_payload
        
        switch (type) {
            case 'set_field':
            case 'set_attribute':
            case 'attribute_modifier':
                // Payload suele ser "field=value" o "field:value"
                const separator = payload.includes('=') ? '=' : ':';
                if (payload.includes(separator)) {
                    const [f, v] = payload.split(separator)
                    const translatedVal = v === 'true' ? 'Sí' : v === 'false' ? 'No' : v;
                    action = `entonces cambiar **${translateField(f.trim())}** a **${translatedVal}**`
                } else {
                    action = `entonces cambiar valor a **${payload}**`
                }
                break
            case 'set_template':
                action = `entonces usar la plantilla con ID **${payload.substring(0, 8)}...**`
                break
            case 'add_warning':
                action = `entonces generar una **ALERTA**: "${payload}"`
                break
            case 'append_text':
                action = `entonces agregar el texto **"${payload}"** al final del nombre`
                break
            case 'prepend_text':
                action = `entonces agregar el texto **"${payload}"** al inicio del nombre`
                break
            case 'activate_icon':
            case 'icon_activation':
                action = `entonces activar el ícono **${payload}**`
                break
            default:
                action = `entonces ejecutar acción: ${type} (${payload})`
        }
    } catch (e) {
        action = `entonces [error en acción]`
    }

    return `${condition}, ${action}.`
}

function translateField(f: string): string {
    const fields: Record<string, string> = {
        'version_code': 'Versión',
        'familia_code': 'Familia',
        'product_type': 'Tipo de Producto',
        'rh': 'RH (Humedad)',
        'assembled_flag': 'Armado',
        'line': 'Línea/Modelo',
        'sap_description': 'Descripción SAP',
        'code': 'Código SKA',
        'final_name_es': 'Nombre en Español',
        'final_name_en': 'Nombre en Inglés',
        'canto_puertas': 'Canto puertas',
        'carb2': 'Certificación CARB2',
        'private_label_client_name': 'Cliente marca propia'
    }
    return fields[f] || f
}
