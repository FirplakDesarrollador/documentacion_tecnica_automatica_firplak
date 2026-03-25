import { dbQuery } from '@/lib/supabase'
import { MassEditClient } from './MassEditClient'

export const dynamic = 'force-dynamic'

export default async function MassEditPage() {
    const products = await dbQuery(`SELECT id, code, familia_code, ref_code, furniture_name, canto_puertas, rh, rh_flag, assembled_flag, commercial_measure, accessory_text, validation_status, sap_description, line, zone_home, designation, color_code, width_cm, depth_cm, height_cm, final_name_es, final_name_en, status, special_label FROM public.cabinet_products ORDER BY updated_at DESC`) || []

    const familiaRecords = await dbQuery(
        `SELECT DISTINCT p.familia_code, f.name
         FROM public.cabinet_products p
         LEFT JOIN public.familias f ON f.code = CASE 
            WHEN p.familia_code ~ '^[VCP].*' THEN SUBSTRING(p.familia_code FROM 2)
            ELSE p.familia_code 
         END
         WHERE p.familia_code IS NOT NULL
         ORDER BY p.familia_code ASC`
    ) || []
    const families = familiaRecords.map((fam: any) => ({
        value: fam.familia_code,
        label: fam.name ? `${fam.familia_code} - ${fam.name}` : fam.familia_code
    }))

    return (
        <div className="container py-8">
            <MassEditClient products={products} families={families} />
        </div>
    )
}
