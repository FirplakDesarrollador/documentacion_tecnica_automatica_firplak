import { dbQuery } from '@/lib/supabase'
import { getFamilyFilters } from '@/lib/data/filters'
import { MassEditClient } from './MassEditClient'

export const dynamic = 'force-dynamic'

export default async function MassEditPage() {
    const products = await dbQuery(`SELECT id, code, familia_code, ref_code, product_type, designation, cabinet_name, canto_puertas, rh, rh_flag, assembled_flag, commercial_measure, accessory_text, door_color_text, carb2, special_label, private_label_client_name, armado_con_lvm, line, use_destination, validation_status, sap_description, zone_home, color_code, width_cm, depth_cm, height_cm, final_name_es, final_name_en, status FROM public.cabinet_products ORDER BY updated_at DESC`) || []

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    const families = await getFamilyFilters()

    return (
        <div className="container py-8">
            <MassEditClient products={products} families={families} />
        </div>
    )
}
