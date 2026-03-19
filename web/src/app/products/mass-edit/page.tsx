import { dbQuery } from '@/lib/supabase'
import { MassEditClient } from './MassEditClient'

export default async function MassEditPage() {
    const products = await dbQuery(`SELECT id, code, familia_code, ref_code, furniture_name, edge_2mm_flag, rh_flag, assembled_flag, commercial_measure, accessory_text, validation_status, sap_description, line, zone_text, color_code, width_cm, depth_cm, height_cm FROM public.products ORDER BY updated_at DESC`) || []

    const familiaRecords = await dbQuery(
        `SELECT DISTINCT p.familia_code, f.name
         FROM public.products p
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
