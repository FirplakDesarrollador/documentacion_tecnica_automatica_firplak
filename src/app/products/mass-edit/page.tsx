import { dbQuery } from '@/lib/supabase'
import { getFamilyFilters } from '@/lib/data/filters'
import { MassEditClient } from './MassEditClient'

export const dynamic = 'force-dynamic'

export default async function MassEditPage() {
<<<<<<< HEAD
    const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
    
    const rows = await dbQuery(`
        SELECT *
        FROM public.v_ui_generate_list 
        ORDER BY sku_complete ASC
    `) || []

    const products = rows.map(mapRowToComposedProduct)
=======
    const products = await dbQuery(`SELECT id, code, familia_code, ref_code, product_type, designation, cabinet_name, canto_puertas, rh, rh_flag, assembled_flag, commercial_measure, accessory_text, door_color_text, carb2, special_label, private_label_client_name, armado_con_lvm, line, use_destination, validation_status, sap_description, zone_home, color_code, width_cm, depth_cm, height_cm, final_name_es, final_name_en, status FROM public.cabinet_products ORDER BY updated_at DESC`) || []
>>>>>>> origin/Oswaldo_cambios

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    const families = await getFamilyFilters()

    return (
        <div className="container py-8">
<<<<<<< HEAD
            <MassEditClient products={products} families={families} readOnly={true} />
=======
            <MassEditClient products={products} families={families} />
>>>>>>> origin/Oswaldo_cambios
        </div>
    )
}
