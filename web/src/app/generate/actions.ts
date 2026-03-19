'use server'

import { dbQuery } from '@/lib/supabase'

export async function resolveAssetsAction(assetIds: string[]) {
    const map: Record<string, string> = {}
    
    // 1. Buscar logo por defecto si se requiere o por si acaso
    const logos = await dbQuery(`SELECT file_path FROM public.assets WHERE type='logo' OR name ILIKE '%logo%' LIMIT 1`) || []
    if (logos[0]) {
        map['logo_empresa'] = logos[0].file_path
    }

    if (!assetIds || assetIds.length === 0) return map
    
    const uniqueIds = Array.from(new Set(assetIds)).filter(id => id && id.length > 30)
    if (uniqueIds.length === 0) return map

    const assets = await dbQuery(
        `SELECT id, file_path FROM public.assets WHERE id IN (${uniqueIds.map(id => `'${id}'`).join(',')})`
    ) || []
    
    assets.forEach((a: any) => {
        map[a.id] = a.file_path
    })
    
    return map
}
