import 'dotenv/config'
import { dbQuery } from '@/lib/supabase'
import { composeProductBySku } from '@/lib/engine/product_composer'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { translateProductToEnglish } from '@/lib/engine/translator'
import fs from 'fs'

async function repair() {
    const skus = ['VBAN05-0114-000-0437', 'VBAN05-0114-000-0442', 'VBAN05-0114-151-0442', 'VBAN05-0114-MRH-0100']
    
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []
    
    const report: any[] = []

    for (const sku of skus) {
        console.log(`Processing ${sku}...`)
        const product = await composeProductBySku(sku)
        if (!product) {
            console.log(`  Not found in composer`)
            continue
        }

        // ES Name
        const evalResult = evaluateProductRules(product as any, rules)
        const final_name_es = evalResult.finalNameEs
        
        // EN Name
        const translateResult = await translateProductToEnglish({...product, final_name_es}, product.product_type || 'MUEBLE')
        const final_name_en = translateResult.isValid ? translateResult.translatedName : translateResult.translatedName

        const before = {
            sku: product.code,
            final_complete_name_es: product.final_complete_name_es,
            final_complete_name_en: product.final_complete_name_en,
            final_base_name_es: product.final_name_es,
            final_base_name_en: product.final_name_en
        }

        const after = {
            sku: product.code,
            final_complete_name_es: final_name_es,
            final_complete_name_en: final_name_en,
            // To update versions, we need to know the base name.
            // But base name is just the name without color.
            // The translation engine creates a complete name.
            // Wait, evaluateProductRules includes the color? Let's see...
        }
        
        console.log("Before:", before)
        console.log("Calculated:", after)
        console.log("Missing Terms:", translateResult.missingTerms)
        console.log("Translations:", translateResult.fieldTranslations)

        report.push({
            sku,
            before,
            after,
            version_id: product.version_code // Actually need the real UUID for version, I'll get it from product_skus
        })
    }

    fs.writeFileSync('scratch/repair_report.json', JSON.stringify(report, null, 2))
    console.log("Done. Check scratch/repair_report.json")
}

repair().catch(console.error)
