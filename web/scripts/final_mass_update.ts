import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { translateProductToEnglish } from '../src/lib/engine/translator';
import * as fs from 'fs';
import * as path from 'path';

async function runMassUpdate() {
    console.log('🚀 Iniciando proceso de traducción masiva (1,167 registros)...');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Obtener todos los productos con paginación
    let allProducts: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error: fetchError } = await supabase
            .from('cabinet_products')
            .select('*')
            .range(from, from + limit - 1);

        if (fetchError || !data) {
            console.error('❌ Error al obtener productos:', fetchError);
            return;
        }

        allProducts = [...allProducts, ...data];
        from += limit;
        if (data.length < limit) hasMore = false;
    }

    console.log(`📦 Se cargaron ${allProducts.length} productos. Procesando traducciones...`);

    const batchSize = 300;
    let currentBatch: string[] = [];
    let batchCount = 1;
    let processedCount = 0;

    for (const p of allProducts) {
        try {
            // El motor detecta automáticamente la familia basándose en product.product_type
            // Pasamos 'MUEBLE' como entidad base, pero el motor usa p.product_type para RESOLVED_TYPE_MAP.
            const { translatedName } = await translateProductToEnglish(p);

            if (translatedName) {
                const escapedName = translatedName.replace(/'/g, "''");
                currentBatch.push(`UPDATE cabinet_products SET final_name_en = '${escapedName}' WHERE id = '${p.id}';`);
            } else {
                console.warn(`⚠️ Nombre vacío para ID: ${p.id} (${p.sap_description})`);
            }
        } catch (err) {
            console.error(`❌ Error traduciendo ID: ${p.id}:`, err);
        }

        processedCount++;
        if (processedCount % batchSize === 0 || processedCount === allProducts.length) {
            const fileName = `mass_update_part_${batchCount}.sql`;
            fs.writeFileSync(fileName, currentBatch.join('\n'));
            console.log(`✅ Lote ${batchCount} generado con ${currentBatch.length} registros.`);
            
            currentBatch = [];
            batchCount++;
        }
    }

    console.log(`\n🏁 Proceso completado. Se generaron ${batchCount - 1} archivos SQL.`);
    console.log(`📊 Total procesados: ${processedCount}`);
}

runMassUpdate().catch(console.error);
