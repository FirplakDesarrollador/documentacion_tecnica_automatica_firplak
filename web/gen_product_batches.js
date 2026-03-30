/**
 * Genera lotes de SQL para products y los imprime numerados 
 * Ejecutar: node gen_product_batches.js
 */
const { PrismaClient } = require('./node_modules/@prisma/client')
const fs = require('fs')

const prisma = new PrismaClient()

function esc(val) {
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'boolean') return val ? 'true' : 'false'
    if (typeof val === 'number') return val
    return `'${String(val).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
}

async function main() {
    const products = await prisma.product.findMany({ orderBy: { createdAt: 'asc' } })
    const BATCH = 50
    let batchNum = 0

    for (let i = 0; i < products.length; i += BATCH) {
        const slice = products.slice(i, i + BATCH)
        const rows = slice.map(p => {
            return `(${esc(p.code)},${esc(p.familia_code)},${esc(p.ref_code)},${esc(p.version_code)},${esc(p.sap_description)},${esc(p.barcode_text)},${esc(p.product_type)},${esc(p.use_destination)},${esc(p.zone_text)},${esc(p.cabinet_name)},${esc(p.designation)},${esc(p.line)},${esc(p.commercial_measure)},${p.assembled_flag ? 'true' : 'false'},${p.rh_flag ? 'true' : 'false'},${esc(p.accessory_text)},${esc(p.door_color_text)},${p.edge_2mm_flag ? 'true' : 'false'},${esc(p.color_code)},${p.width_cm === null ? 'NULL' : p.width_cm},${p.depth_cm === null ? 'NULL' : p.depth_cm},${p.height_cm === null ? 'NULL' : p.height_cm},${p.weight_kg === null ? 'NULL' : p.weight_kg},${p.width_in === null ? 'NULL' : p.width_in},${p.depth_in === null ? 'NULL' : p.depth_in},${p.height_in === null ? 'NULL' : p.height_in},${p.weight_lb === null ? 'NULL' : p.weight_lb},${p.icon_rh ? 'true' : 'false'},${p.icon_full_extension ? 'true' : 'false'},${p.icon_soft_close ? 'true' : 'false'},${p.icon_edge_2mm ? 'true' : 'false'},${esc(p.isometric_path)},${p.private_label_flag ? 'true' : 'false'},${esc(p.private_label_client_name)},${esc(p.final_name_es)},${esc(p.final_name_en)},${p.stacking_max === null ? 'NULL' : p.stacking_max},${esc(p.validation_status)},${esc(p.code)})`
        }).join(',\n')

        const sql = `-- Lote ${batchNum} (${i}-${Math.min(i+BATCH, products.length)})
INSERT INTO public.products (code,familia_code,ref_code,version_code,sap_description,barcode_text,product_type,use_destination,zone_text,cabinet_name,designation,line,commercial_measure,assembled_flag,rh_flag,accessory_text,door_color_text,edge_2mm_flag,color_code,width_cm,depth_cm,height_cm,weight_kg,width_in,depth_in,height_in,weight_lb,icon_rh,icon_full_extension,icon_soft_close,icon_edge_2mm,isometric_path,private_label_flag,private_label_client_name,final_name_es,final_name_en,stacking_max,validation_status,sku_servicios_ref)
VALUES
${rows}
ON CONFLICT (code) DO NOTHING;\n`

        fs.writeFileSync(`product_batch_${String(batchNum).padStart(3,'0')}.sql`, sql)
        batchNum++
    }

    console.log(`✅ Generados ${batchNum} archivos SQL de lotes de productos`)
    await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
