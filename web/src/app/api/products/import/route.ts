import { dbQuery } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { parseProductCode } from '@/lib/engine/codeParser'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const records = body.data

        if (!Array.isArray(records)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
        }

        let successCount = 0

        function esc(v: any) {
            if (v === null || v === undefined) return 'NULL'
            if (typeof v === 'boolean') return v ? 'true' : 'false'
            if (typeof v === 'number') return isNaN(v) ? 'NULL' : String(v)
            return `'${String(v).replace(/'/g, "''")}'`
        }

        for (const record of records) {
            const rawCode = String(record.Codigo || record.code || '').trim()
            if (!rawCode) continue

            const sapDesc = record.Descripcion || record.sap_description || null
            const isTrue = (val: any) => String(val).toLowerCase() === 'true' || String(val).toLowerCase() === 'si' || String(val).toLowerCase() === 'sí' || String(val) === '1'

            const parsed = await parseProductCode(rawCode, sapDesc, isTrue(record.RH || record.rh_flag))

            const iconsJson = JSON.stringify([record['ICON 1'], record['ICON 2'], record['ICON 3'], record['ICON 4'], record.ICON1, record.ICON2].filter(Boolean))
            const accesoryArr = [record.Accesorio, record.Riel].filter(Boolean)
            const accessoryText = accesoryArr.length > 0 ? accesoryArr.join(' ') : null

            const d = {
                code: rawCode,
                sap_description: sapDesc,
                familia_code: parsed.familia_code,
                ref_code: parsed.ref_code,
                version_code: parsed.version_code,
                color_code: parsed.color_code || record['Codigo C'] || null,
                product_type: record['Tipo de producto'] || parsed.product_type || null,
                use_destination: record.Hogar || parsed.use_destination || null,
                assembled_flag: record.Armado ? isTrue(record.Armado) : parsed.assembled_flag,
                private_label_flag: isTrue(record['Clientes marca propia']),
                private_label_client_name: record['Clientes marca propia'] !== 'SI' && record['Clientes marca propia'] ? record['Clientes marca propia'] : null,
                designation: record.Designacion || null,
                cabinet_name: record['Nombre mueble'] || null,
                line: record.Linea || null,
                commercial_measure: record.Medida || null,
                accessory_text: accessoryText,
                door_color_text: record['Color puertas'] || null,
                canto_puertas: isTrue(record.Canto) ? 'CANTO 2 MM' : 'NA',
                carb2: (record.SAPDescription || '').toUpperCase().includes('CARB') ? 'CARB2' : 'NA',
                final_name_es: record['DESCRIPCION FINAL'] || null,
                final_name_en: record['DESCRIPCION INGLES'] || null,
                isometric_path: record.ISOMETRICO || null,
                depth_cm: parseFloat(record.FONDO) || null,
                height_cm: parseFloat(record.ALTO) || null,
                width_cm: parseFloat(record.ANCHO) || null,
                weight_kg: parseFloat(record.PESO) || null,
                depth_in: parseFloat(record.D) || null,
                height_in: parseFloat(record.H) || null,
                width_in: parseFloat(record.W) || null,
                weight_lb: parseFloat(record.Wg) || null,
                icon_rh: isTrue(record.RH),
                icon_full_extension: String(record.Riel || '').toUpperCase().includes('FULL EXTENSION'),
                icon_soft_close: String(record.Accesorio || '').toUpperCase().includes('CIERRE LENTO') || iconsJson.includes('CIERRE LENTO'),
                icon_edge_2mm: isTrue(record.Canto),
                sku_servicios_ref: rawCode,
            }

            try {
                await dbQuery(`
                    INSERT INTO public.cabinet_products (code, sap_description, familia_code, ref_code, version_code, color_code, product_type, use_destination, assembled_flag, private_label_flag, private_label_client_name, designation, cabinet_name, line, commercial_measure, accessory_text, door_color_text, canto_puertas, carb2, final_name_es, final_name_en, isometric_path, depth_cm, height_cm, width_cm, weight_kg, depth_in, height_in, width_in, weight_lb, icon_rh, icon_full_extension, icon_soft_close, icon_edge_2mm, sku_servicios_ref)
                    VALUES (${esc(d.code)}, ${esc(d.sap_description)}, ${esc(d.familia_code)}, ${esc(d.ref_code)}, ${esc(d.version_code)}, ${esc(d.color_code)}, ${esc(d.product_type)}, ${esc(d.use_destination)}, ${d.assembled_flag ? 'true' : 'false'}, ${d.private_label_flag ? 'true' : 'false'}, ${esc(d.private_label_client_name)}, ${esc(d.designation)}, ${esc(d.cabinet_name)}, ${esc(d.line)}, ${esc(d.commercial_measure)}, ${esc(d.accessory_text)}, ${esc(d.door_color_text)}, ${esc(d.canto_puertas)}, ${esc(d.carb2)}, ${esc(d.final_name_es)}, ${esc(d.final_name_en)}, ${esc(d.isometric_path)}, ${d.depth_cm ? d.depth_cm : 'NULL'}, ${d.height_cm ? d.height_cm : 'NULL'}, ${d.width_cm ? d.width_cm : 'NULL'}, ${d.weight_kg ? d.weight_kg : 'NULL'}, ${d.depth_in ? d.depth_in : 'NULL'}, ${d.height_in ? d.height_in : 'NULL'}, ${d.width_in ? d.width_in : 'NULL'}, ${d.weight_lb ? d.weight_lb : 'NULL'}, ${d.icon_rh ? 'true' : 'false'}, ${d.icon_full_extension ? 'true' : 'false'}, ${d.icon_soft_close ? 'true' : 'false'}, ${d.icon_edge_2mm ? 'true' : 'false'}, ${esc(d.sku_servicios_ref)})
                    ON CONFLICT (code) DO UPDATE SET
                        sap_description=EXCLUDED.sap_description, familia_code=EXCLUDED.familia_code,
                        ref_code=EXCLUDED.ref_code, version_code=EXCLUDED.version_code,
                        color_code=EXCLUDED.color_code, rh_flag=EXCLUDED.rh_flag,
                        product_type=EXCLUDED.product_type, use_destination=EXCLUDED.use_destination,
                        assembled_flag=EXCLUDED.assembled_flag, designation=EXCLUDED.designation,
                        cabinet_name=EXCLUDED.cabinet_name, line=EXCLUDED.line,
                        commercial_measure=EXCLUDED.commercial_measure, accessory_text=EXCLUDED.accessory_text,
                        final_name_es=EXCLUDED.final_name_es, final_name_en=EXCLUDED.final_name_en,
                        depth_cm=EXCLUDED.depth_cm, height_cm=EXCLUDED.height_cm, width_cm=EXCLUDED.width_cm,
                        weight_kg=EXCLUDED.weight_kg, icon_rh=EXCLUDED.icon_rh,
                        icon_soft_close=EXCLUDED.icon_soft_close, canto_puertas=EXCLUDED.canto_puertas,
                        carb2=EXCLUDED.carb2,
                        updated_at=now()
                `)
                successCount++
            } catch (rowErr: any) {
                console.error('Row import error:', rawCode, rowErr.message?.substring(0, 200))
            }
        }

        return NextResponse.json({ success: true, count: successCount })
    } catch (error) {
        console.error('Import Error:', error)
        return NextResponse.json({ error: 'Failed to process import' }, { status: 500 })
    }
}
