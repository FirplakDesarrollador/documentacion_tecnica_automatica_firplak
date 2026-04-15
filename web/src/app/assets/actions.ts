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
        // Los valores de referencia pueden ser puros "ref_code" o compuestos "ref_code|||commercial_measure"
        const specificPairs = referenceCodes.map(v => {
            const [rc, cm] = v.split('|||')
            if (cm) {
                return `(ref_code = '${rc.replace(/'/g, "''")}' AND commercial_measure = '${cm.replace(/'/g, "''")}')`
            }
            return `ref_code = '${rc.replace(/'/g, "''")}'`
        })
        whereParts.push(`(${specificPairs.join(' OR ')})`)
    } else if (familyCodes.length > 0) {
        whereParts.push(`familia_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (measureCodes && measureCodes.length > 0) {
            whereParts.push(`commercial_measure IN (${measureCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        }
    } else {
        throw new Error("Target selection (Family or Reference) is required")
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

    // Propagate new file_path to all products that reference this asset as isometric
    // This prevents drift between the asset record and the product's cached snapshot path
    if (data.file_path) {
        await dbQuery(`
            UPDATE public.cabinet_products
            SET isometric_path = '${data.file_path.replace(/'/g, "''")}',
                updated_at = now()
            WHERE isometric_asset_id = '${assetId}'
        `)
    }

    revalidatePath('/assets')
    revalidatePath('/products')
    return { success: true }
}
