'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function getFamiliesAction() {
    const families = await dbQuery(`
        SELECT DISTINCT p.familia_code, f.name
        FROM public.products p
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
        SELECT DISTINCT ref_code, furniture_name 
        FROM public.products 
        WHERE ref_code IS NOT NULL AND familia_code IN (${filter})
        ORDER BY ref_code ASC
    `) || []
    
    return refRecords.map((rec: any) => ({ 
        value: rec.ref_code as string, 
        label: `${rec.ref_code} - ${rec.furniture_name || ''}` 
    }))
}

export async function getAssetsByTypeAction(type: string) {
    return await dbQuery(`SELECT * FROM public.assets WHERE type = '${type}' ORDER BY created_at DESC`) || []
}

export async function associateIsometricAction(data: {
    assetId: string,
    familyCodes: string[],
    referenceCodes: string[]
}) {
    const { assetId, familyCodes, referenceCodes } = data
    
    if (!assetId) throw new Error("Asset ID is required")
    
    const asset = await dbQuery(`SELECT file_path FROM public.assets WHERE id = '${assetId}' LIMIT 1`)
    if (!asset || asset.length === 0) throw new Error("Asset not found")
    const filePath = asset[0].file_path

    let whereClause = ''
    if (referenceCodes.length > 0) {
        const refFilter = referenceCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')
        whereClause = `WHERE ref_code IN (${refFilter})`
    } else if (familyCodes.length > 0) {
        const famFilter = familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')
        whereClause = `WHERE familia_code IN (${famFilter})`
    } else {
        throw new Error("Target selection (Family or Reference) is required")
    }

    await dbQuery(`
        UPDATE public.products 
        SET isometric_asset_id = '${assetId}', 
            isometric_path = '${filePath}',
            updated_at = now()
        ${whereClause}
    `)

    revalidatePath('/assets')
    revalidatePath('/products')
    
    return { success: true }
}
