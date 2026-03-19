/**
 * Exporta datos de SQLite a un archivo SQL para ejecutar en Supabase via MCP
 * Ejecutar: node export_to_sql.js
 */
const { PrismaClient } = require('./node_modules/@prisma/client')
const fs = require('fs')

const prisma = new PrismaClient()

function esc(val) {
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'boolean') return val ? 'true' : 'false'
    if (typeof val === 'number') return val
    // Escape single quotes
    return `'${String(val).replace(/'/g, "''")}'`
}

async function main() {
    let sql = '-- Migración de datos SQLite → Supabase I+D\n-- Generado: ' + new Date().toISOString() + '\n\n'

    // ---- COLORS ----
    const colors = await prisma.color.findMany()
    sql += `-- COLORS (${colors.length} registros)\n`
    for (const c of colors) {
        sql += `INSERT INTO public.colors (code_4dig, code_short, name_color_sap, created_at)\n`
        sql += `VALUES (${esc(c.code_4dig)}, ${esc(c.code_short)}, ${esc(c.name_color_sap)}, ${esc(c.createdAt?.toISOString())})\n`
        sql += `ON CONFLICT (code_4dig) DO NOTHING;\n`
    }
    sql += '\n'

    // ---- FAMILIAS ----
    const familias = await prisma.familia.findMany()
    sql += `-- FAMILIAS (${familias.length} registros)\n`
    for (const f of familias) {
        sql += `INSERT INTO public.familias (code, name, product_type, use_destination, assembled_default, rh_default, created_at)\n`
        sql += `VALUES (${esc(f.code)}, ${esc(f.name)}, ${esc(f.product_type)}, ${esc(f.use_destination)}, ${esc(f.assembled_default)}, ${esc(f.rh_default)}, ${esc(f.createdAt?.toISOString())})\n`
        sql += `ON CONFLICT (code) DO NOTHING;\n`
    }
    sql += '\n'

    // ---- PRODUCTS ----
    const products = await prisma.product.findMany()
    sql += `-- PRODUCTS (${products.length} registros)\n`
    for (const p of products) {
        sql += `INSERT INTO public.products (code, familia_code, ref_code, version_code, sap_description, barcode_text, product_type, use_destination, zone_text, furniture_name, designation, line, commercial_measure, assembled_flag, rh_flag, accessory_text, door_color_text, edge_2mm_flag, color_code, width_cm, depth_cm, height_cm, weight_kg, width_in, depth_in, height_in, weight_lb, icon_rh, icon_full_extension, icon_soft_close, icon_edge_2mm, isometric_path, private_label_flag, private_label_client_name, final_name_es, final_name_en, stacking_max, validation_status, sku_servicios_ref, created_at, updated_at)\n`
        sql += `VALUES (${esc(p.code)}, ${esc(p.familia_code)}, ${esc(p.ref_code)}, ${esc(p.version_code)}, ${esc(p.sap_description)}, ${esc(p.barcode_text)}, ${esc(p.product_type)}, ${esc(p.use_destination)}, ${esc(p.zone_text)}, ${esc(p.furniture_name)}, ${esc(p.designation)}, ${esc(p.line)}, ${esc(p.commercial_measure)}, ${esc(p.assembled_flag)}, ${esc(p.rh_flag)}, ${esc(p.accessory_text)}, ${esc(p.door_color_text)}, ${esc(p.edge_2mm_flag)}, ${esc(p.color_code)}, ${esc(p.width_cm)}, ${esc(p.depth_cm)}, ${esc(p.height_cm)}, ${esc(p.weight_kg)}, ${esc(p.width_in)}, ${esc(p.depth_in)}, ${esc(p.height_in)}, ${esc(p.weight_lb)}, ${esc(p.icon_rh)}, ${esc(p.icon_full_extension)}, ${esc(p.icon_soft_close)}, ${esc(p.icon_edge_2mm)}, ${esc(p.isometric_path)}, ${esc(p.private_label_flag)}, ${esc(p.private_label_client_name)}, ${esc(p.final_name_es)}, ${esc(p.final_name_en)}, ${esc(p.stacking_max)}, ${esc(p.validation_status)}, ${esc(p.code)}, ${esc(p.createdAt?.toISOString())}, ${esc(p.updatedAt?.toISOString())})\n`
        sql += `ON CONFLICT (code) DO NOTHING;\n`
    }
    sql += '\n'

    fs.writeFileSync('migration_data.sql', sql)
    console.log(`✅ SQL generado: migration_data.sql (${(sql.length / 1024).toFixed(1)} KB)`)
    console.log(`   Colors: ${colors.length}, Familias: ${familias.length}, Products: ${products.length}`)
    await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
