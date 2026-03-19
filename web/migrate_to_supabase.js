/**
 * Script de Migración: SQLite (Prisma) → Supabase I+D
 * Ejecutar UNA SOLA VEZ desde la carpeta /web:
 *   node migrate_to_supabase.js
 *
 * Requiere que web/.env tenga NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const { PrismaClient } = require('./node_modules/@prisma/client')
const { createClient } = require('./node_modules/@supabase/supabase-js')

// Cargar .env manualmente
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...rest] = trimmed.split('=')
        const value = rest.join('=').replace(/^"(.*)"$/, '$1')
        if (key) process.env[key.trim()] = value
    }
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en web/.env')
    process.exit(1)
}

const prisma = new PrismaClient()
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
})

async function migrate() {
    console.log('🚀 Iniciando migración SQLite → Supabase I+D...\n')

    // -------------------------------------------------------------------------
    // 1. Colors (292 registros)
    // -------------------------------------------------------------------------
    console.log('📦 Migrando colores...')
    const colors = await prisma.color.findMany()
    if (colors.length > 0) {
        const colorData = colors.map(c => ({
            code_4dig: c.code_4dig,
            code_short: c.code_short,
            name_color_sap: c.name_color_sap,
            created_at: c.createdAt?.toISOString()
        }))
        const { error } = await supabase.from('colors').upsert(colorData, { onConflict: 'code_4dig' })
        if (error) console.error('  ⚠️ Error en colors:', error.message)
        else console.log(`  ✅ ${colors.length} colores migrados`)
    }

    // -------------------------------------------------------------------------
    // 2. Familias (5 registros)
    // -------------------------------------------------------------------------
    console.log('📦 Migrando familias...')
    const familias = await prisma.familia.findMany()
    if (familias.length > 0) {
        const familiaData = familias.map(f => ({
            code: f.code,
            name: f.name,
            product_type: f.product_type,
            use_destination: f.use_destination,
            assembled_default: f.assembled_default,
            rh_default: f.rh_default,
            created_at: f.createdAt?.toISOString()
        }))
        const { error } = await supabase.from('familias').upsert(familiaData, { onConflict: 'code' })
        if (error) console.error('  ⚠️ Error en familias:', error.message)
        else console.log(`  ✅ ${familias.length} familias migradas`)
    }

    // -------------------------------------------------------------------------
    // 3. Products (1168 registros - en lotes para no exceder límites)
    // -------------------------------------------------------------------------
    console.log('📦 Migrando productos (puede tomar un momento)...')
    const productCount = await prisma.product.count()
    const BATCH_SIZE = 100
    let migrated = 0
    let errors = 0

    for (let skip = 0; skip < productCount; skip += BATCH_SIZE) {
        const batch = await prisma.product.findMany({ skip, take: BATCH_SIZE })
        const productData = batch.map(p => ({
            code: p.code,
            familia_code: p.familia_code,
            ref_code: p.ref_code,
            version_code: p.version_code,
            sap_description: p.sap_description,
            barcode_text: p.barcode_text,
            product_type: p.product_type,
            use_destination: p.use_destination,
            zone_text: p.zone_text,
            furniture_name: p.furniture_name,
            designation: p.designation,
            line: p.line,
            commercial_measure: p.commercial_measure,
            assembled_flag: p.assembled_flag,
            rh_flag: p.rh_flag,
            accessory_text: p.accessory_text,
            door_color_text: p.door_color_text,
            edge_2mm_flag: p.edge_2mm_flag,
            color_code: p.color_code,
            width_cm: p.width_cm,
            depth_cm: p.depth_cm,
            height_cm: p.height_cm,
            weight_kg: p.weight_kg,
            width_in: p.width_in,
            depth_in: p.depth_in,
            height_in: p.height_in,
            weight_lb: p.weight_lb,
            icon_rh: p.icon_rh,
            icon_full_extension: p.icon_full_extension,
            icon_soft_close: p.icon_soft_close,
            icon_edge_2mm: p.icon_edge_2mm,
            isometric_path: p.isometric_path,
            private_label_flag: p.private_label_flag,
            private_label_client_name: p.private_label_client_name,
            final_name_es: p.final_name_es,
            final_name_en: p.final_name_en,
            stacking_max: p.stacking_max,
            validation_status: p.validation_status,
            sku_servicios_ref: p.code, // El code local sirve como referencia al sku de Servicios
            created_at: p.createdAt?.toISOString(),
            updated_at: p.updatedAt?.toISOString()
        }))
        const { error } = await supabase.from('products').upsert(productData, { onConflict: 'code' })
        if (error) {
            console.error(`  ⚠️ Error en lote ${skip}-${skip + BATCH_SIZE}:`, error.message)
            errors++
        } else {
            migrated += batch.length
            process.stdout.write(`\r  ✅ ${migrated}/${productCount} productos...`)
        }
    }
    console.log(`\n  Productos: ${migrated} migrados, ${errors} lotes con error.`)

    // -------------------------------------------------------------------------
    // 4. Rules (15 registros)
    // -------------------------------------------------------------------------
    console.log('📦 Migrando reglas...')
    const rules = await prisma.rule.findMany()
    if (rules.length > 0) {
        const ruleData = rules.map(r => ({
            rule_type: r.rule_type,
            target_entity: r.target_entity,
            condition_expression: r.condition_expression,
            action_type: r.action_type,
            action_payload: r.action_payload,
            priority: r.priority,
            enabled: r.enabled,
            notes: r.notes,
            created_at: r.createdAt?.toISOString()
        }))
        const { error } = await supabase.from('rules').insert(ruleData)
        if (error) console.error('  ⚠️ Error en rules:', error.message)
        else console.log(`  ✅ ${rules.length} reglas migradas`)
    }

    // -------------------------------------------------------------------------
    // 5. Templates (1 registro)
    // -------------------------------------------------------------------------
    console.log('📦 Migrando plantillas...')
    const templates = await prisma.template.findMany()
    if (templates.length > 0) {
        const templateData = templates.map(t => ({
            name: t.name,
            document_type: t.document_type,
            width_mm: t.width_mm,
            height_mm: t.height_mm,
            orientation: t.orientation,
            elements_json: t.elements_json,
            version: t.version,
            active: t.active,
            created_at: t.createdAt?.toISOString()
        }))
        const { error } = await supabase.from('templates').insert(templateData)
        if (error) console.error('  ⚠️ Error en templates:', error.message)
        else console.log(`  ✅ ${templates.length} plantillas migradas`)
    }

    // -------------------------------------------------------------------------
    // 6. Assets (1 registro)
    // -------------------------------------------------------------------------
    console.log('📦 Migrando assets...')
    const assets = await prisma.asset.findMany()
    if (assets.length > 0) {
        const assetData = assets.map(a => ({
            type: a.type,
            name: a.name,
            file_path: a.file_path,
            tags: a.tags,
            created_at: a.createdAt?.toISOString()
        }))
        const { error } = await supabase.from('assets').insert(assetData)
        if (error) console.error('  ⚠️ Error en assets:', error.message)
        else console.log(`  ✅ ${assets.length} assets migrados`)
    }

    console.log('\n🎉 Migración completada!')
    await prisma.$disconnect()
}

migrate().catch(e => {
    console.error('❌ Error fatal en la migración:', e)
    prisma.$disconnect()
    process.exit(1)
})
