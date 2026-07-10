'use server'

import { supabaseServer } from '@/lib/supabase'
import type { ProductFilters } from '@/lib/engine/product_composer'
import { assertPermission } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertPermission('module:generate')
}

export async function resolveAssetsAction(assetIds: string[]) {
    await assertAdminAccess()

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
        (sysAssets as { name: string | null; file_path: string | null }[]).forEach((a) => {
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
        (customAssets as { id: string; file_path: string | null }[]).forEach((a) => {
            map[a.id] = a.file_path || ''
        })
    }
    
    const shouldDebugAssetMap = process.env.NODE_ENV === 'development' || process.env.EXPORT_DEBUG === '1'
    if (shouldDebugAssetMap) {
        console.log("==> MAP FETCHED:", map)
        console.log("==> ASSET MAP GENERATED (SERVER):", map)
    }
    return map
}

export async function getAllFilteredProductsAction(
    families: string[],
    references: string[],
    measures: string[],
    search: string | null,
    brandScope: string,
    privateLabelClientName: string
) {
    await assertAdminAccess()

    const { composeProductsByFilters } = await import('@/lib/engine/product_composer')

    const filters: ProductFilters = {
        families: families.length > 0 ? families : undefined,
        references: references.length > 0 ? references : undefined,
        measures: measures.length > 0 ? measures : undefined,
        search: search || undefined,
        brandFilter:
            brandScope === 'firplak'
                ? { scope: 'firplak' }
                : { scope: 'private_label', clientName: privateLabelClientName },
    }

    const result = await composeProductsByFilters(filters, 10000)
    return result.products
}
