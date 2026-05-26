import { dbQuery } from '@/lib/supabase'
import { UploadAssetButton } from '@/components/assets/UploadAssetButton'
import { IsometricAssociationDialog } from '@/components/assets/IsometricAssociationDialog'
import { SmartIsometricSuggestionsDialog } from '@/components/assets/SmartIsometricSuggestionsDialog'
import { SmartIsometricNormalizationDialog } from '@/components/assets/SmartIsometricNormalizationDialog'
import { OrphanProductsDialog } from '@/components/assets/OrphanProductsDialog'
import { ResourceSearch } from '@/components/assets/ResourceSearch'
import { AssetsGallery } from '@/components/assets/AssetsGallery'
import { getGroupedIsometricsAction } from '@/app/assets/actions'

export default async function AssetsPage({
    searchParams: searchParamsPromise
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const searchParams = await searchParamsPromise
    const query = typeof searchParams.q === 'string' ? searchParams.q : ''
    
    let whereClause = ''
    if (query) {
        const keywords = query.split(/\s+/).filter(Boolean)
        const escaped = keywords.map(k => `'%${k.replace(/'/g, "''")}%'`)
        const conditions = `(${escaped.map(e => `name ILIKE ${e}`).join(' AND ')})
            OR (${escaped.map(e => `type ILIKE ${e}`).join(' AND ')})
            OR (${escaped.map(e => `file_path ILIKE ${e}`).join(' AND ')})`
        whereClause = `WHERE ${conditions}`
    }

    const assets = await dbQuery(`
        WITH asset_counts AS (
            SELECT 
                a.id,
                (
                    (SELECT COUNT(*) FROM public.product_references r WHERE r.isometric_asset_id::text = a.id::text) + 
                    (SELECT COUNT(*) FROM public.product_versions v WHERE v.version_attrs->>'isometric_asset_id' = a.id::text)
                ) as total_relations
            FROM public.assets a
        )
        SELECT 
            a.*, 
            ac.total_relations as relation_count
        FROM public.assets a 
        JOIN asset_counts ac ON a.id = ac.id
        ${whereClause} 
        ORDER BY 
            (CASE WHEN ac.total_relations = 0 AND UPPER(a.type) = 'ISOMETRIC' THEN 0 ELSE 1 END) ASC,
            a.created_at DESC
    `) || []

    const defaultNames = [
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
    ]

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Recursos multimedia</h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-2xl font-medium">
                        Biblioteca centralizada de logos, iconos, isométricos, vistas y otros necesarios para la generación de la documentación automática.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <SmartIsometricSuggestionsDialog />
                    <SmartIsometricNormalizationDialog />
                    <OrphanProductsDialog />
                    <IsometricAssociationDialog />
                    <UploadAssetButton 
                        className="h-10 px-6 font-bold shadow-sm bg-slate-900 hover:bg-slate-800 text-white transition-all"
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-wrap gap-4 items-center bg-slate-50/50">
                    <ResourceSearch />
                </div>
                <AssetsGallery
                    isometricRows={!query ? (await getGroupedIsometricsAction() || []) : []}
                    icons={(assets || []).filter((a: any) => a.type?.toLowerCase() === 'icon')}
                    logos={(assets || []).filter((a: any) => a.type?.toLowerCase() === 'logo')}
                    allAssets={assets || []}
                    defaultNames={defaultNames}
                    searchQuery={query}
                />
            </div>
        </div>
    )
}
