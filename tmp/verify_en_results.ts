import { translateProductToEnglish, ProductPayload } from '../web/src/lib/engine/translator'
import dotenv from 'dotenv'
import path from 'path'

// Load env for Supabase
dotenv.config({ path: path.join(__dirname, '../web/.env') })

async function runTests() {
    console.log("=== VERIFICACIÓN DE MOTOR DE TRADUCCIÓN ADAPTATIVO ===\n")

    const testCases: { name: string, payload: ProductPayload }[] = [
        {
            name: "Caso 1: Mueble Elevado + RH + Canto 2mm",
            payload: {
                product_type: 'MUEBLE',
                designation: 'ELEVADO',
                use_destination: 'LAVAMANOS',
                furniture_name: 'GODAI',
                line: 'ESSENTIAL',
                rh: 'RH',
                canto_puertas: 'CANTO 2MM',
                commercial_measure: '48X38'
            }
        },
        {
            name: "Caso 2: Cierre Lento Oculto (Accesorio)",
            payload: {
                product_type: 'MUEBLE',
                designation: 'PISO',
                use_destination: 'LAVAMANOS',
                furniture_name: 'BASIC',
                line: 'CLASS',
                accessory_text: 'CIERRE LENTO OCULTO',
                commercial_measure: '60X45'
            }
        },
        {
            name: "Caso 3: Sin redudancia LAV (Absorbido en VANITY)",
            payload: {
                product_type: 'MUEBLE',
                designation: 'ELEVADO',
                use_destination: 'LAVAMANOS',
                furniture_name: 'THOR',
                line: 'LIFE'
            }
        }
    ]

    for (const test of testCases) {
        console.log(`--- ${test.name} ---`)
        console.log("Input:", JSON.stringify(test.payload, null, 2))
        try {
            const result = await translateProductToEnglish(test.payload)
            console.log("Output Final:", result.translatedName)
            if (result.missingTerms.length > 0) {
                console.log("Términos Faltantes:", result.missingTerms)
            }
            if (!result.isValid) {
                console.log("Error:", result.errorReason)
            }
        } catch (e: any) {
            console.error("Error en motor:", e.message)
        }
        console.log("\n")
    }
}

runTests()
