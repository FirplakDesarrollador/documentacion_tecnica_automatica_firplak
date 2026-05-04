
import * as dotenv from 'dotenv';
import * as path from 'path';
import { translateProductToEnglish, ProductPayload } from '../src/lib/engine/translator';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface TestCase {
    id: string;
    description: string;
    payload: ProductPayload;
    expected: string;
    checkType: 'equals' | 'contains' | 'regex';
}

const testCases: TestCase[] = [
    {
        id: 'TC1.1',
        description: 'Herrajes: RFE CIERRE LENTO',
        payload: { accessory_text: 'RFE CIERRE LENTO', product_type: 'MUEBLE' },
        expected: 'SFE SOFT CLOSE',
        checkType: 'equals'
    },
    {
        id: 'TC1.2',
        description: 'Herrajes: R OCULTO CIERRE LENTO',
        payload: { accessory_text: 'R OCULTO CIERRE LENTO', product_type: 'MUEBLE' },
        expected: 'S CONCEALED SOFT CLOSE',
        checkType: 'equals'
    },
    {
        id: 'TC1.3',
        description: 'Herrajes: Compuesto con conector +',
        payload: { accessory_text: 'R OCULTO + RFE CIERRE LENTO', product_type: 'MUEBLE' },
        expected: 'S CONCEALED + SFE SOFT CLOSE',
        checkType: 'equals'
    },
    {
        id: 'TC1.4',
        description: 'Herrajes: Compuesto sin espacios en +',
        payload: { accessory_text: 'R OCULTO+RFE CIERRE LENTO', product_type: 'MUEBLE' },
        expected: 'S CONCEALED + SFE SOFT CLOSE',
        checkType: 'equals'
    },
    {
        id: 'TC2.1',
        description: 'Cantos: 0.45 MM Flip',
        payload: { canto_puertas: 'CANTO 0.45 MM', product_type: 'MUEBLE' },
        expected: '0.45MM EDGE BAND',
        checkType: 'equals'
    },
    {
        id: 'TC2.2',
        description: 'Cantos: 2 MM Flip',
        payload: { canto_puertas: 'CANTO 2 MM', product_type: 'MUEBLE' },
        expected: '2MM EDGE BAND',
        checkType: 'equals'
    },
    {
        id: 'TC3.1',
        description: 'Decimales: Coma en medida',
        payload: { commercial_measure: '44,5X43,5', product_type: 'MUEBLE' },
        expected: '18INX17IN',
        checkType: 'equals'
    },
    {
        id: 'TC3.2',
        description: 'Decimales: Punto y unidad CM',
        payload: { commercial_measure: '44.5X43.5 CM', product_type: 'MUEBLE' },
        expected: '18INX17IN',
        checkType: 'equals'
    },
    {
        id: 'TC4.1',
        description: 'Familias: TAPA VESSEL',
        payload: { product_type: 'TAPA', designation: 'VESSEL' },
        expected: 'VESSEL VANITY TOP',
        checkType: 'equals'
    },
    {
        id: 'TC4.2',
        description: 'Familias: TAPA INTEL',
        payload: { product_type: 'TAPA', designation: 'INTEL' },
        expected: 'INTEL VANITY TOP',
        checkType: 'equals'
    },
    {
        id: 'TC5.1',
        description: 'Contexto: Evitar CABINET genérico en LAVAMANOS',
        payload: { product_type: 'MUEBLE', use_destination: 'LAVAMANOS' },
        expected: 'VANITY',
        checkType: 'contains'
    }
];

async function runTests() {
    console.log('\n🚀 INICIANDO PRUEBAS DEL MOTOR DE TRADUCCIÓN EN\n');
    console.log('------------------------------------------------------------------------------------------------');
    console.log('| ID     | ESCENARIO                                    | RESULTADO ESPERADO        | ESTADO   |');
    console.log('------------------------------------------------------------------------------------------------');

    let passedCount = 0;

    for (const tc of testCases) {
        try {
            // Mocking config for tests to be deterministic without relying on DB configs
            // However, translatedName depends on the config 'emit' property.
            // For this test, we assume the production config has these fields set to emit.
            // The engine now uses real config from .env
            const result = await translateProductToEnglish(tc.payload, 'MUEBLE');
            const actual = result.translatedName;
            
            let passed = false;
            if (tc.checkType === 'equals') {
                passed = (actual === tc.expected);
            } else if (tc.checkType === 'contains') {
                passed = actual.includes(tc.expected);
            }
            
            // Check for fragmentation (Rule 3)
            // Atomic fragmentation is strictly forbidden in output or missing terms
            const hasFragmentation = result.missingTerms.some(t => /^(R|\+|\d+|RFE|SFE)$/.test(t) || t === 'CIERRE' || t === 'LENTO');
            if (hasFragmentation) {
                passed = false;
                console.error(`[!] ERROR DE FRAGMENTACIÓN en ${tc.id}: se detectaron términos atómicos prohibidos en missingTerms: ${result.missingTerms}`);
            }

            // Check for empty (Rule 4)
            if (!actual && tc.expected) {
                passed = false;
                console.error(`[!] ERROR DE VACÍO en ${tc.id}: El motor no generó nombre.`);
            }

            const status = passed ? '✅ PASS' : '❌ FAIL';
            if (passed) passedCount++;

            console.log(`| ${tc.id.padEnd(6)} | ${tc.description.padEnd(44)} | ${tc.expected.padEnd(25)} | ${status} |`);
            if (!passed) {
                console.log(`|        | -> ACTUAL: "${actual}"`);
                if (result.missingTerms.length > 0) {
                    console.log(`|        | -> MISSING: ${result.missingTerms.join(', ')}`);
                }
            }
        } catch (error: any) {
            console.log(`| ${tc.id.padEnd(6)} | ${tc.description.padEnd(44)} | ERROR: ${error.message.substring(0, 15)}... | ❌ ERR  |`);
        }
    }

    console.log('------------------------------------------------------------------------------------------------\n');
    console.log(`RESULTADO FINAL: ${passedCount} de ${testCases.length} pruebas pasaron.\n`);
    
    if (passedCount === testCases.length) {
        console.log('🌟 TODOS LOS ESCENARIOS CRÍTICOS HAN SIDO VALIDADOS CON ÉXITO.\n');
    } else {
        console.log('⚠️ HAY FALLOS EN EL MOTOR QUE REQUIEREN ATENCIÓN.\n');
        process.exit(1);
    }
}

runTests();
