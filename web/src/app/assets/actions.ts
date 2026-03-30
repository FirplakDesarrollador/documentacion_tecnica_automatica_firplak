'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function getFamiliesAction() {
    const families = await dbQuery(`
        SELECT DISTINCT p.familia_code, f.name
        FROM public.cabinet_products p
        LEFT JOIN public.familias f ON f.code = CASE 
            WHEN p.familia_code ~ '^[VCP].*' THEN SUBSTRING(p.familia_code FROM 2)
            ELSE p.familia_code 
        END
        WHERE p.familia_code IS NOT NULL
        ORDER BY p.familia_code ASC
    `) || []
    
    return families.map((fam: any) => ({
        value: fam.familia_code,
        label: fam.name ? `${fam.familia_code} - ${fam.name}` : fam.familia_code
    }))
}

export async function getReferencesByFamilyAction(familyCodes: string[]) {
    if (!familyCodes || familyCodes.length === 0) return []
    
    const filter = familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')
    const refRecords = await dbQuery(`
        SELECT DISTINCT ref_code, cabinet_name 
        FROM public.cabinet_products 
        WHERE ref_code IS NOT NULL AND familia_code IN (${filter})
        ORDER BY ref_code ASC
    `) || []
    
    return refRecords.map((rec: any) => ({ 
        value: rec.ref_code as string, 
        label: `${rec.ref_code} - ${rec.cabinet_name || ''}` 
    }))
}

export async function getMeasuresByFamilyAndRefAction(familyCodes: string[], referenceCodes: string[]) {
    if ((!familyCodes || familyCodes.length === 0) && (!referenceCodes || referenceCodes.length === 0)) return []
    
    let whereParts = []
    if (familyCodes && familyCodes.length > 0) {
        whereParts.push(`familia_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }
    if (referenceCodes && referenceCodes.length > 0) {
        whereParts.push(`ref_code IN (${referenceCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }

    const measureRecords = await dbQuery(`
        SELECT DISTINCT commercial_measure 
        FROM public.cabinet_products 
        WHERE commercial_measure IS NOT NULL AND (${whereParts.join(' OR ')})
        ORDER BY commercial_measure ASC
    `) || []
    
    return measureRecords.map((rec: any) => ({ 
        value: rec.commercial_measure as string, 
        label: rec.commercial_measure as string 
    }))
}

export async function getAssetsByTypeAction(type: string) {
    return await dbQuery(`SELECT * FROM public.assets WHERE type = '${type}' ORDER BY created_at DESC`) || []
}

export async function associateIsometricAction(data: {
    assetId: string,
    familyCodes: string[],
    referenceCodes: string[],
    measureCodes?: string[]
}) {
    const { assetId, familyCodes, referenceCodes, measureCodes = [] } = data
    
    if (!assetId) throw new Error("Asset ID is required")
    
    const asset = await dbQuery(`SELECT file_path FROM public.assets WHERE id = '${assetId}' LIMIT 1`)
    if (!asset || asset.length === 0) throw new Error("Asset not found")
    const filePath = asset[0].file_path

    let whereParts = []
    
    if (referenceCodes.length > 0) {
        whereParts.push(`ref_code IN (${referenceCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    } else if (familyCodes.length > 0) {
        whereParts.push(`familia_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    } else {
        throw new Error("Target selection (Family or Reference) is required")
    }

    if (measureCodes.length > 0) {
        whereParts.push(`commercial_measure IN (${measureCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`

    await dbQuery(`
        UPDATE public.cabinet_products 
        SET isometric_asset_id = '${assetId}', 
            isometric_path = '${filePath}',
            updated_at = now()
        ${whereClause}
    `)

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
        'Icono Canto 2mm',
        'Icono Cierre Lento',
        'Icono Extensión Total',
        'Icono CARB2',
        'Logo CHILEMAT',
        "Logo D-ACQUA",
    "Logo PROMART",
    "Logo FERMETAL"
    )`) || []
    
    if (defaults.some((d: any) => d.id === assetId)) {
        throw new Error("No puedes eliminar un recurso del sistema por defecto.")
    }

    await dbQuery(`DELETE FROM public.assets WHERE id = '${assetId}'`)
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
    revalidatePath('/assets')
    return { success: true }
}
