import { dbQuery } from '@/lib/supabase'
import { MassEditClient } from './MassEditClient'

export default async function MassEditPage() {
    const products = await dbQuery(`SELECT id, code, familia_code, ref_code, furniture_name, edge_2mm_flag, rh_flag, assembled_flag, commercial_measure, accessory_text, validation_status, sap_description, line, zone_text, color_code, width_cm, depth_cm, height_cm FROM public.products ORDER BY updated_at DESC`) || []

    const familiasDb = await dbQuery(`SELECT code, name FROM public.familias ORDER BY code ASC`) || []
    const families = familiasDb.map((f: any) => ({ value: f.code, label: `${f.code} - ${f.name}` }))

    return (
        <div className="container py-8">
            <MassEditClient products={products} families={families} />
        </div>
    )
}
