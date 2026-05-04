import { evaluateProductRules } from '../src/lib/engine/ruleEvaluator';

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
console.log('Trace:', JSON.stringify(result.trace, null, 2));
