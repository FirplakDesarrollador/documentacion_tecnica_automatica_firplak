import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env', override: false })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase credentials in .env")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
})

async function migrateAssets() {
    console.log("1. (Saltado) Bucket assets ya fue creado vía SQL Admin.")

    console.log("2. Leyendo archivos locales de public/uploads...")
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadsDir)) {
        console.log("   No hay carpeta public/uploads, nada que migrar.")
        return
    }

    const files = fs.readdirSync(uploadsDir)
    console.log(`   Se encontraron ${files.length} archivos locales. Subiendo a Supabase...`)

    let uploadedCount = 0;
    for (const file of files) {
        if (!file.endsWith('.svg') && !file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) {
            continue;
        }

        const filePath = path.join(uploadsDir, file)
        const fileData = fs.readFileSync(filePath)
        const bucketPath = `assets/${file}`

        console.log(`   Subiendo: ${file}...`)
        const { error: uploadError } = await supabase.storage.from('assets').upload(bucketPath, fileData, {
            upsert: true,
            contentType: file.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
        })

        if (uploadError) {
            console.error(`   Error subiendo ${file}:`, uploadError.message)
        } else {
            uploadedCount++;
        }
    }
    console.log(`   ${uploadedCount} archivos subidos exitosamente.`)

    console.log("3. Actualizando rutas en public.assets...")
    const { data: assetsDb, error: fetchAssetsError } = await supabase.from('assets').select('id, file_path')
    if (fetchAssetsError) {
        console.error("   Error obteniendo assets:", fetchAssetsError.message)
        return
    }

    let updatedAssets = 0;
    for (const asset of assetsDb || []) {
        if (asset.file_path && asset.file_path.startsWith('/uploads/')) {
            const fileName = asset.file_path.split('/').pop()
            const bucketPath = `assets/${fileName}`
            const { data: urlData } = supabase.storage.from('assets').getPublicUrl(bucketPath)
            
            const { error: updateError } = await supabase.from('assets').update({ file_path: urlData.publicUrl }).eq('id', asset.id)
            if (!updateError) updatedAssets++;
        }
    }
    console.log(`   Se actualizaron ${updatedAssets} registros en public.assets.`)

    console.log("4. Actualizando rutas en public.cabinet_products...")
    const { data: productsDb, error: fetchProductsError } = await supabase.from('cabinet_products').select('id, isometric_path')
    if (!fetchProductsError) {
        let updatedProducts = 0;
        for (const prod of productsDb || []) {
            if (prod.isometric_path && prod.isometric_path.startsWith('/uploads/')) {
                const fileName = prod.isometric_path.split('/').pop()
                const bucketPath = `assets/${fileName}`
                const { data: urlData } = supabase.storage.from('assets').getPublicUrl(bucketPath)
                
                const { error: updateError } = await supabase.from('cabinet_products').update({ isometric_path: urlData.publicUrl }).eq('id', prod.id)
                if (!updateError) updatedProducts++;
            }
        }
        console.log(`   Se actualizaron ${updatedProducts} registros en public.cabinet_products.`)
    }

    console.log("Migración completada con éxito.")
}

migrateAssets()
