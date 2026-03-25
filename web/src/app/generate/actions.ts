'use server'

import { dbQuery } from '@/lib/supabase'

export async function resolveAssetsAction(assetIds: string[]) {
    const map: Record<string, string> = {}
    
    // 1. Buscar assets por nombres específicos del sistema
    const systemNames = [
        'Logo Firplak general',
        'Icono RH Fijo',
        'Icono Canto 2mm',
        'Icono Canto 1.5mm',
        'Icono CARB2',
        'Icono Cierre Lento',
        'Icono Extensión Total'
    ]
    
    const sysAssets = await dbQuery(`
        SELECT name, file_path 
        FROM public.assets 
        WHERE name IN (${systemNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',')})
    `) || []
    
    sysAssets.forEach((a: any) => {
        if (a.name) {
            map[a.name] = a.file_path
            // Map to legacy keys too
            if (a.name === 'Logo Firplak general') map['logo_empresa'] = a.file_path
            if (a.name === 'Isométrico (Placeholder)') map['isometrico_placeholder'] = a.file_path
            if (a.name === 'Icono RH Fijo') map['sys_icon_rh'] = a.file_path
            if (a.name === 'Icono Canto 2mm') map['sys_icon_edge_2mm'] = a.file_path
            if (a.name === 'Icono Canto 1.5mm') map['sys_icon_edge_1_5mm'] = a.file_path
            if (a.name === 'Icono CARB2') map['sys_icon_carb2'] = a.file_path
            if (a.name === 'Icono Cierre Lento') map['sys_icon_soft_close'] = a.file_path
            if (a.name === 'Icono Extensión Total') map['sys_icon_full_extension'] = a.file_path
        }
    })

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
