import { dbQuery } from '@/lib/supabase'
import { getFamilyFilters } from '@/lib/data/filters'
import { MassEditClient } from './MassEditClient'

export const dynamic = 'force-dynamic'

export default async function MassEditPage() {
    const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
    
    const rows = await dbQuery(`
        SELECT *
        FROM public.v_ui_generate_list 
        ORDER BY sku_complete ASC
    `) || []

    const products = rows.map(mapRowToComposedProduct)

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    const families = await getFamilyFilters()

    return (
        <div className="container py-8">
            <MassEditClient products={products} families={families} readOnly={true} />
        </div>
    )
}
