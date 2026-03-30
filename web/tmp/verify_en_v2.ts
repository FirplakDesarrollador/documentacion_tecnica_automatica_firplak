import { translateProductToEnglish, ProductPayload } from '../src/lib/engine/translator'
import fs from 'fs'
import path from 'path'

// Manual .env loader
try {
    const envPath = path.join(__dirname, '../.env')
    if (fs.existsSync(envPath)) {
        const env = fs.readFileSync(envPath, 'utf8')
        env.split('\n').forEach(line => {
            const match = line.match(/^\s*([^#=]+)=(.*)$/)
            if (match) {
                const key = match[1].trim()
                const value = match[2].trim().replace(/^["'](.*)["']$/, '$1')
                process.env[key] = value
            }
        })
    }
} catch (e) {}

async function runTests() {
    console.log("=== PRUEBAS DE MOTOR EN V2 (ROBUSTEZ) ===\n")

    const testCases: { name: string, payload: ProductPayload, activeVars?: string[] }[] = [
        {
            name: "Scenario A (Canto): Fragmentos redundantes SAP",
            payload: {
                product_type: 'MUEBLE',
                designation: 'PISO',
                use_destination: 'LAVAMANOS',
                cabinet_name: 'BASICO',
                line: 'ESSENTIAL',
                commercial_measure: '63X48',
                accessory_text: 'CON MANIJAS CANTO 2 MM', 
                canto_puertas: 'CANTO 2 MM',
            },
            activeVars: ['product_type', 'designation', 'use_destination', 'cabinet_name', 'line', 'commercial_measure', 'accessory_text', 'canto_puertas']
        },
        {
            name: "Scenario B (Cierre Lento): Múltiples bloques válidos",
            payload: {
                product_type: 'MUEBLE',
                cabinet_name: 'GODAI',
                accessory_text: 'BISAGRAS CIERRE LENTO RIELES CIERRE LENTO',
            },
            activeVars: ['product_type', 'cabinet_name', 'accessory_text']
        },
        {
            name: "Scenario C (Vanity): Absorción de Tipo (LAVAMANOS)",
            payload: {
                product_type: 'MUEBLE',
                designation: 'PISO',
                use_destination: 'LAVAMANOS',
                armado_con_lvm: 'LAVAMANOS',
            },
            activeVars: ['product_type', 'designation', 'use_destination', 'armado_con_lvm']
        },
        {
            name: "Scenario D (RH/Medida/Integridad): RH -> MR y Códigos",
            payload: {
                product_type: 'MUEBLE',
                rh: 'RH',
                commercial_measure: '100X50',
                cabinet_name: 'AK-47 SERIES', // Test code integrity
                line: 'ESSENTIAL V2.1', // Test line name integrity
            },
            activeVars: ['product_type', 'rh', 'commercial_measure', 'cabinet_name', 'line']
        },
        {
            name: "Scenario E (Color/Assembled): Flags y Atributos",
            payload: {
                product_type: 'MUEBLE',
                designation: 'ELEVADO',
                cabinet_name: 'BASIC',
                door_color_text: 'NEGRO HUMO',
                assembled_flag: true
            },
            activeVars: ['product_type', 'designation', 'cabinet_name', 'door_color_text', 'assembled_flag']
        }
    ]

    for (const test of testCases) {
        console.log(`--- ${test.name} ---`)
        try {
            const result = await translateProductToEnglish(test.payload, 'MUEBLE', test.activeVars)
            console.log("Resultado EN:", result.translatedName)
            if (result.missingTerms.length > 0) console.log("Faltantes:", result.missingTerms)
            if (!result.isValid) console.log("Inválido:", result.errorReason)
            
            // Prove the sorting order by re-running a trace (or just trusting the engine's result if we verified it)
            // For now, let's just show the final name which IS the proof if it matches the expected pattern.
        } catch (e: any) {
            console.error("Error:", e.message)
        }
        console.log("\n")
    }
}

runTests()
