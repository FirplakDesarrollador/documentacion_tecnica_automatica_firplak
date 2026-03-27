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

const REAL_PRODUCTS: ProductPayload[] = [
    {
        product_type: "MUEBLE",
        designation: "CUBO",
        use_destination: "LAVAMANOS",
        furniture_name: "GODAI",
        line: "CLASS",
        commercial_measure: "63X48",
        accessory_text: "NA",
        canto_puertas: "CANTO 2 MM",
        rh: "NA",
        carb2: "NA",
        door_color_text: "NA",
        assembled_flag: false,
        armado_con_lvm: "NA"
    },
    {
        product_type: "MUEBLE",
        designation: "ELEVADO",
        use_destination: "LAVAMANOS",
        furniture_name: "TIZIANO",
        line: "LIFE",
        commercial_measure: "124X48",
        accessory_text: "RFE",
        canto_puertas: "CANTO 0.45 MM",
        rh: "NA",
        carb2: "NA",
        door_color_text: "NA",
        assembled_flag: false,
        armado_con_lvm: "NA"
    }
]

async function runControlledTest() {
    console.log("| Product Context | Result (EN) | Status |")
    console.log("| :--- | :--- | :--- |")
    
    for (const p of REAL_PRODUCTS) {
        try {
            // Simplified active vars as they would come from the UI
            const activeVars = ['product_type', 'designation', 'use_destination', 'furniture_name', 'line', 'commercial_measure', 'canto_puertas']
            const result = await translateProductToEnglish(p, 'MUEBLE', activeVars)
            const context = `${p.furniture_name} ${p.line} ${p.commercial_measure}`
            console.log(`| ${context} | ${result.translatedName} | ${result.isValid ? '✅' : '❌'} |`)
        } catch (e: any) {
            console.log(`| ERROR | ${e.message} | ❌ |`)
        }
    }
}

runControlledTest()
