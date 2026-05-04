'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getFamilyFilters, getReferenceFilters } from '@/lib/data/filters'

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
    }

    revalidatePath('/assets')
    revalidatePath('/products')
    
    return { success: true }
}

export async function deleteAssetAction(assetId: string) {
    // Protección contra el borrado de activos de sistema
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

    // Protección V6.1: Impedir borrado de assets en uso por referencias o versiones
    const safeId = assetId.replace(/'/g, "''")

    const refsUsing = await dbQuery(`
        SELECT family_code, reference_code 
        FROM public.product_references 
        WHERE isometric_asset_id = '${safeId}'
    `) || []

    const versionsUsing = await dbQuery(`
        SELECT v.version_code, v.sku_base, r.family_code, r.reference_code
        FROM public.product_versions v
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE v.version_attrs->>'isometric_asset_id' = '${safeId}'
    `) || []

    if (refsUsing.length > 0 || versionsUsing.length > 0) {
        const details: string[] = []
        if (refsUsing.length > 0) {
            const refList = refsUsing.map((r: any) => `${r.family_code}-${r.reference_code}`).join(', ')
            details.push(`Referencias: ${refList}`)
        }
        if (versionsUsing.length > 0) {
            const verList = versionsUsing.map((v: any) => `${v.sku_base} (${v.family_code}-${v.reference_code} v${v.version_code})`).join(', ')
            details.push(`Versiones (override): ${verList}`)
        }
        throw new Error(
            `Este asset está asociado a referencias o versiones activas. ` +
            `Desasócialo o reemplázalo antes de eliminarlo.\n\n` +
            `En uso por:\n${details.join('\n')}`
        )
    }

    await dbQuery(`DELETE FROM public.assets WHERE id = '${safeId}'`)
    revalidatePath('/assets')
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

