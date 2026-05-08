'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getFamilyFilters, getReferenceFilters } from '@/lib/data/filters'

async function revalidateValidationSweepEverywhere() {
    // Local (same server) cache invalidation.
    revalidateTag('validation-sweep', { expire: 0 })

    // Optional remote invalidation (Vercel) when this action runs on localhost.
    const remoteUrl = process.env.REVALIDATE_REMOTE_URL
    const secret = process.env.REVALIDATE_SECRET
    if (!remoteUrl || !secret) return

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        await fetch(remoteUrl, {
            method: 'POST',
            headers: { 'x-revalidate-secret': secret },
            signal: controller.signal,
        })
        clearTimeout(timeout)
    } catch (e) {
        // Non-blocking: the DB write already happened; this only affects freshness in Vercel UI.
        console.warn('Remote revalidate failed:', e)
    }
}

export async function getFamiliesAction() {
    return await getFamilyFilters()
}

export async function getReferencesByFamilyAction(familyCodes: string[]) {
    return await getReferenceFilters(familyCodes)
}

export async function getMeasuresByFamilyAndRefAction(familyCodes: string[], referenceCodes: string[]) {
    if ((!familyCodes || familyCodes.length === 0) && (!referenceCodes || referenceCodes.length === 0)) return []
    
    let whereParts = []
    if (familyCodes && familyCodes.length > 0) {
        whereParts.push(`family_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }
    if (referenceCodes && referenceCodes.length > 0) {
        whereParts.push(`reference_code IN (${referenceCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }

    const measureRecords = await dbQuery(`
        SELECT DISTINCT commercial_measure 
        FROM public.v_ui_generate_list 
        WHERE commercial_measure IS NOT NULL AND (${whereParts.join(' OR ')})
        ORDER BY commercial_measure ASC
    `) || []
    
    return measureRecords.map((rec: any) => ({ 
        value: rec.commercial_measure as string, 
        label: rec.commercial_measure as string 
    }))
}

export async function getVersionsByFamilyAndRefAction(familyCodes: string[], referenceCodes: string[]) {
    if ((!familyCodes || familyCodes.length === 0) && (!referenceCodes || referenceCodes.length === 0)) return []
    
    let whereParts = []
    if (familyCodes && familyCodes.length > 0) {
        whereParts.push(`family_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }
    if (referenceCodes && referenceCodes.length > 0) {
        // Handle combined ref_code|||measure
        const refs = referenceCodes.map(v => v.split('|||')[0])
        whereParts.push(`reference_code IN (${refs.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }

    const versionRecords = await dbQuery(`
        SELECT DISTINCT version_code 
        FROM public.v_ui_generate_list 
        WHERE version_code IS NOT NULL AND (${whereParts.join(' OR ')})
        ORDER BY version_code ASC
    `) || []
    
    return versionRecords.map((rec: any) => ({ 
        value: rec.version_code as string, 
        label: `Versión ${rec.version_code}`
    }))
}

export async function getAssetsByTypeAction(type: string) {
    return await dbQuery(`SELECT * FROM public.assets WHERE type = '${type}' ORDER BY created_at DESC`) || []
}

export async function associateIsometricAction(data: {
    assetId: string,
    familyCodes: string[],
    referenceCodes: string[],
    measureCodes?: string[],
    versionCodes?: string[]
}) {
    const { assetId, familyCodes, referenceCodes, measureCodes = [], versionCodes = [] } = data
    
    if (!assetId) throw new Error("Asset ID is required")
    
    const asset = await dbQuery(`SELECT file_path FROM public.assets WHERE id = '${assetId}' LIMIT 1`)
    if (!asset || asset.length === 0) throw new Error("Asset not found")
    const filePath = asset[0].file_path

    // --- 1. Identify Target References ---
    let refIds: string[] = []
    
    if (referenceCodes.length > 0) {
        const specificPairs = referenceCodes.map(v => {
            const [rc, cm] = v.split('|||')
            if (cm) {
                return `(reference_code = '${rc.replace(/'/g, "''")}' AND commercial_measure = '${cm.replace(/'/g, "''")}')`
            }
            return `reference_code = '${rc.replace(/'/g, "''")}'`
        })
        const refs = await dbQuery(`SELECT id FROM public.product_references WHERE ${specificPairs.join(' OR ')}`)
        refIds = refs.map((r: any) => r.id)
    } else if (familyCodes.length > 0) {
        let query = `SELECT id FROM public.product_references WHERE family_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`
        if (measureCodes && measureCodes.length > 0) {
            query += ` AND commercial_measure IN (${measureCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`
        }
        const refs = await dbQuery(query)
        refIds = refs.map((r: any) => r.id)
    } else {
        throw new Error("Target selection (Family or Reference) is required")
    }

    if (refIds.length === 0) throw new Error("No references found for the selection")

    // --- 2. Perform Update based on Granularity ---
    let updatedCount = 0
    if (versionCodes && versionCodes.length > 0) {
        // CASE: Override by Version
        // We update product_versions.version_attrs JSONB field
        const versionFilter = `(${versionCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`
        const refsFilter = `(${refIds.map(id => `'${id}'`).join(',')})`
        
        await dbQuery(`
            UPDATE public.product_versions
            SET version_attrs = jsonb_set(
                jsonb_set(COALESCE(version_attrs, '{}'::jsonb), '{isometric_asset_id}', '"${assetId}"'),
                '{isometric_path}', '"${filePath}"'
            ),
            updated_at = now()
            WHERE reference_id IN ${refsFilter} AND version_code IN ${versionFilter}
        `)

        const verifyRows = await dbQuery(`
            SELECT COUNT(*)::int as updated_count
            FROM public.product_versions
            WHERE reference_id IN ${refsFilter}
              AND version_code IN ${versionFilter}
              AND version_attrs->>'isometric_asset_id' = '${assetId.replace(/'/g, "''")}'
        `) || []
        updatedCount = Number(verifyRows?.[0]?.updated_count || 0)
    } else {
        // CASE: Default Reference Asset
        // We update product_references directly
        const refsFilter = `(${refIds.map(id => `'${id}'`).join(',')})`
        await dbQuery(`
            UPDATE public.product_references
            SET isometric_asset_id = '${assetId}',
                isometric_path = '${filePath}',
                updated_at = now()
            WHERE id IN ${refsFilter}
        `)

        const verifyRows = await dbQuery(`
            SELECT COUNT(*)::int as updated_count
            FROM public.product_references
            WHERE id IN ${refsFilter}
              AND isometric_asset_id = '${assetId.replace(/'/g, "''")}'
        `) || []
        updatedCount = Number(verifyRows?.[0]?.updated_count || 0)
    }

    if (!updatedCount || updatedCount <= 0) {
        throw new Error("No se actualizo ningun registro con la seleccion actual.")
    }

    revalidatePath('/assets')
    revalidatePath('/products')
    await revalidateValidationSweepEverywhere()
    
    return { success: true, updatedCount }
}

export async function deleteAssetAction(assetId: string) {
    // 1. Protección contra el borrado de activos de sistema
    const defaults = await dbQuery(`SELECT id FROM public.assets WHERE name IN (
        'Logo Empresa Pordefecto',
        'Isométrico (Placeholder)',
        'Icono RH Fijo',
        'Icono Canto',
        'Icono Cierre Lento',
        'Icono Extensión Total',
        'Icono CARB2',
        'Logo CHILEMAT',
        'Logo D-ACQUA',
        'Logo PROMART',
        'Logo FERMETAL'
    )`) || []
    
    if (defaults.some((d: any) => d.id === assetId)) {
        throw new Error("No puedes eliminar un recurso del sistema por defecto.")
    }

    const safeId = assetId.replace(/'/g, "''")

    // 2. Obtener metadatos del archivo para borrar del Storage
    const asset = await dbQuery(`SELECT file_path FROM public.assets WHERE id = '${safeId}' LIMIT 1`)
    if (!asset || asset.length === 0) return { success: true } // Ya no existe
    const filePath = asset[0].file_path

    // 3. LIMPIEZA PROFUNDA (Cascada manual)
    
    // 3a. Limpiar en Referencias
    await dbQuery(`
        UPDATE public.product_references 
        SET isometric_asset_id = NULL, 
            isometric_path = NULL,
            updated_at = now()
        WHERE isometric_asset_id = '${safeId}'
    `)

    // 3b. Limpiar en Versiones (JSONB)
    // Usamos el operador '-' para eliminar las llaves del objeto JSONB
    await dbQuery(`
        UPDATE public.product_versions 
        SET version_attrs = version_attrs - 'isometric_asset_id' - 'isometric_path',
            updated_at = now()
        WHERE version_attrs->>'isometric_asset_id' = '${safeId}'
    `)

    // 4. Borrar archivo físico de Supabase Storage
    try {
        // Extraer el nombre del archivo de la URL
        // Las URLs de Supabase suelen terminar en /assets/nombre-archivo.ext
        const urlParts = filePath.split('/')
        const fileName = urlParts[urlParts.length - 1]
        
        if (fileName && filePath.includes('supabase')) {
            const { supabase } = await import('@/lib/supabase')
            await supabase.storage.from('assets').remove([`assets/${fileName}`])
        }
    } catch (storageError) {
        console.error("Error al borrar archivo de storage:", storageError)
        // No bloqueamos el flujo si falla el storage físico
    }

    // 5. Borrar registro de la tabla assets
    await dbQuery(`DELETE FROM public.assets WHERE id = '${safeId}'`)
    
    revalidatePath('/assets')
    revalidatePath('/products')
    
    return { success: true }
}

export async function updateAssetAction(assetId: string, data: { name?: string, file_path?: string }) {
    const updates = []
    if (data.name) updates.push(`name = '${data.name.replace(/'/g, "''")}'`)
    if (data.file_path) updates.push(`file_path = '${data.file_path.replace(/'/g, "''")}'`)
    
    if (updates.length === 0) return { success: true }

    await dbQuery(`
        UPDATE public.assets 
        SET ${updates.join(', ')}, updated_at = now() 
        WHERE id = '${assetId}'
    `)

    // Propagate new file_path to V6.1 tables only
    if (data.file_path) {
        const newPath = data.file_path.replace(/'/g, "''")
        
        // 1. Update references
        await dbQuery(`
            UPDATE public.product_references
            SET isometric_path = '${newPath}',
                updated_at = now()
            WHERE isometric_asset_id = '${assetId}'
        `)

        // 2. Update version overrides in JSONB
        // This is more complex: we need to update the path inside the JSONB if the asset_id matches
        await dbQuery(`
            UPDATE public.product_versions
            SET version_attrs = jsonb_set(version_attrs, '{isometric_path}', '"${newPath}"'),
                updated_at = now()
            WHERE version_attrs->>'isometric_asset_id' = '${assetId}'
        `)
    }

    revalidatePath('/assets')
    revalidatePath('/products')
    return { success: true }
}

