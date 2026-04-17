'use server'

import { supabaseServer } from '@/lib/supabase'

export async function resolveAssetsAction(assetIds: string[]) {
    const map: Record<string, string> = {}
    
    // 1. Buscar assets por nombres específicos del sistema (Estándar)
    const systemNames = [
        'Logo Firplak general',
        'Icono RH Fijo',
        'Icono Canto',
        'Icono Canto 1.5mm',
        'Icono CARB2',
        'Icono Cierre Lento',
        'Icono Extensión Total'
    ]
    
    // Usamos el cliente estándar (PostgREST) en lugar de dbQuery (Management API SQL)
    const { data: sysAssets, error: sysError } = await supabaseServer
        .from('assets')
        .select('name, file_path')
        .in('name', systemNames)

    if (sysError) {
        console.error("Error fetching system assets:", sysError)
    }

    if (sysAssets) {
        (sysAssets as any[]).forEach((a) => {
            if (a.name) {
                map[a.name] = a.file_path || ''
                // Mapeo a llaves heredadas (legacy)
                if (a.name === 'Logo Firplak general') map['logo_empresa'] = a.file_path || ''
                if (a.name === 'Isométrico (Placeholder)') map['isometrico_placeholder'] = a.file_path || ''
                if (a.name === 'Icono RH Fijo') map['sys_icon_rh'] = a.file_path || ''
                if (a.name === 'Icono Canto') map['sys_icon_canto'] = a.file_path || ''
                if (a.name === 'Icono Canto 1.5mm') map['sys_icon_edge_1_5mm'] = a.file_path || ''
                if (a.name === 'Icono CARB2') map['sys_icon_carb2'] = a.file_path || ''
                if (a.name === 'Icono Cierre Lento') map['sys_icon_soft_close'] = a.file_path || ''
                if (a.name === 'Icono Extensión Total') map['sys_icon_full_extension'] = a.file_path || ''
            }
        })
    }

    if (!assetIds || assetIds.length === 0) return map
    
    const uniqueIds = Array.from(new Set(assetIds)).filter(id => id && id.length > 30)
    if (uniqueIds.length === 0) return map

    const { data: customAssets, error: customError } = await supabaseServer
        .from('assets')
        .select('id, file_path')
        .in('id', uniqueIds)

    if (customError) {
        console.error("Error fetching custom assets:", customError)
    }
    
    if (customAssets) {
        (customAssets as any[]).forEach((a) => {
            map[a.id] = a.file_path || ''
        })
    }
    
    console.log("==> MAP FETCHED:", map)
    console.log("==> ASSET MAP GENERATED (SERVER):", map)
    return map
}
