import 'dotenv/config'
import { dbQuery } from '../src/lib/supabase'

async function run() {
    console.log('Fetching all products...')
    const products = await dbQuery('SELECT id, cabinet_name, line, sap_description, designation, accessory_text FROM public.cabinet_products')
    
    if (!products) {
        console.error('Error fetching products')
        return
    }

    console.log(`Loaded ${products.length} products. Processing...`)

    let updates = []

    for (const p of products) {
        if (!p.cabinet_name) continue;

        let newDesignation = p.designation;
        let originalText = p.accessory_text?.toUpperCase() || '';
        
        let extractedOriginal: string[] = []
        
        // Preserve specific edges
        const edgeMatch = originalText.match(/CANTO\s*(\d*\.?\d+)MM/);
        if (edgeMatch) {
            extractedOriginal.push(`CANTO ${edgeMatch[1]}MM`)
        }
        
        const allKnownAccessories = [
            'RIEL OCULTO CIERRE SUAVE',
            'RIEL FULL EXTENSION CIERRE SUAVE',
            'RIEL FULL EXTENSION',
            'BISAGRAS CIERRE SUAVE', // can be BISAGRA CIERRE SUAVE
            'SIN MANIJAS',
            'CON MANIJAS',
            'TAPA VESSEL',
            'CIERRE LENTO OCULTO',
            'CIERRE LENTO'
        ]
        
        if (originalText.includes('BISAGRA CIERRE SUAVE') && !originalText.includes('BISAGRAS CIERRE SUAVE')) {
            extractedOriginal.push('BISAGRAS CIERRE SUAVE');
        }
        
        for (const known of allKnownAccessories) {
            if (originalText.includes(known)) {
                extractedOriginal.push(known);
            }
        }
        
        const finalSet = new Set(extractedOriginal);
        const pushAcc = (val: string) => finalSet.add(val);
        
        const name = p.cabinet_name.toUpperCase()
        const line = p.line?.toUpperCase() || ''
        const descUpper = p.sap_description?.toUpperCase() || ''

        // 1. CLASS
        if (line === 'CLASS') {
             if (name === 'VITELLI') { newDesignation = 'ELEVADO'; pushAcc('RIEL OCULTO CIERRE SUAVE'); pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'GRECO') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION CIERRE SUAVE'); pushAcc('RIEL OCULTO CIERRE SUAVE'); }
             else if (name === 'MACAO') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION CIERRE SUAVE'); pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'MISUS') { newDesignation = 'ELEVADO'; pushAcc('RIEL OCULTO CIERRE SUAVE'); }
             else if (name === 'THALOS') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION CIERRE SUAVE'); }
             else if (name === 'OTUS') { newDesignation = 'A PISO'; pushAcc('RIEL FULL EXTENSION CIERRE SUAVE'); }
             else if (name === 'ZACURA') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION CIERRE SUAVE'); }
             else if (name === 'GODAI') { 
                if (descUpper.includes('ENTREPA')) newDesignation = 'SOPORTE Y ESTRUCTURA CON ENTREPAÑO'
                else if (descUpper.includes('SOPORTE Y ESTRUCTURA')) newDesignation = 'SOPORTE Y ESTRUCTURA'
                else if (descUpper.includes('SOPORTE')) newDesignation = 'SOPORTE'
                else if (descUpper.includes('CUBO-CAJON') || descUpper.includes('CUBO CAJON')) newDesignation = 'CUBO-CAJON'
                else if (descUpper.includes('CUBO')) newDesignation = 'CUBO'
                pushAcc('RIEL FULL EXTENSION CIERRE SUAVE'); 
             }
        } else if (line === 'LIFE') {
             if (name === 'MACAO') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION'); pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'TIZIANO') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION'); pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'MISUS') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION'); }
             else if (name === 'MONET') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION'); pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'VALDEZ') { 
                if (descUpper.includes('PISO')) newDesignation = 'A PISO'
                else newDesignation = 'ELEVADO'
                pushAcc('RIEL FULL EXTENSION'); pushAcc('BISAGRAS CIERRE SUAVE'); 
             }
             else if (name === 'DA VINCI') { newDesignation = 'A PISO'; pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'POLOCK') { newDesignation = 'A PISO'; pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'PICASSO') { newDesignation = 'ELEVADO'; pushAcc('RIEL FULL EXTENSION'); }
        } else if (line === 'ESSENTIAL') {
             if (name === 'VEGA') { newDesignation = 'A PISO'; pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'VAN GOGH') { newDesignation = 'ELEVADO'; pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'CALDER') { newDesignation = 'ELEVADO'; pushAcc('BISAGRAS CIERRE SUAVE'); }
             else if (name === 'BASICO' || name === 'BÁSICO') {
                 if (descUpper.includes('PISO')) newDesignation = 'A PISO'
                 else newDesignation = 'ELEVADO'
                 pushAcc('BISAGRAS CIERRE SUAVE');
                 if (descUpper.includes('SIN MANIJA')) {
                     pushAcc('SIN MANIJAS');
                     finalSet.delete('CON MANIJAS');
                 } else {
                     pushAcc('CON MANIJAS');
                     finalSet.delete('SIN MANIJAS');
                 }
             }
             else if (name === 'RAYO') { newDesignation = 'ELEVADO'; }
             else if (name === 'ELEVADO' || name === 'A PISO') { pushAcc('TAPA VESSEL'); }
        }
        
        let newAcc = Array.from(finalSet).join(' ');

        if (newDesignation !== p.designation || newAcc !== p.accessory_text) {
            updates.push({
                id: p.id,
                designation: newDesignation,
                accessory_text: newAcc || null
            })
        }
    }

    console.log(`Prepared ${updates.length} updates. Sending chunks...`)

    let totalUpdated = 0;
    
    // Batch updates en Supabase dbQuery (es uno por uno o usar un CASE enorme, 
    // pero con dbQuery podemos mandar queries individuales de manera segura)
    for (const u of updates) {
        let sql = `UPDATE public.cabinet_products SET designation = ${u.designation ? `'${u.designation}'` : 'NULL'}, accessory_text = ${u.accessory_text ? `'${u.accessory_text}'` : 'NULL'} WHERE id = '${u.id}'`;
        await dbQuery(sql);
        totalUpdated++;
        if (totalUpdated % 50 === 0) console.log(`Updated ${totalUpdated} / ${updates.length}`);
    }

    console.log('Finished updating products.')
}

run().catch(console.error)
