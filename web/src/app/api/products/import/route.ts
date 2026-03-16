import prisma from '@/lib/prisma'
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

        for (const record of records) {
            // El campo esencial es el Código
            const rawCode = String(record.Codigo || record.code || '').trim()
            if (!rawCode) continue // skip invalid rows

            const sapDesc = record.Descripcion || record.sap_description || null

            // Boolean parsing helper
            const isTrue = (val: any) => String(val).toLowerCase() === 'true' || String(val).toLowerCase() === 'si' || String(val).toLowerCase() === 'sí' || String(val) === '1'

            // Parse Code (Familia, Ref, Color, Versión + Reglas RH)
            const parsed = await parseProductCode(rawCode, sapDesc, isTrue(record.RH || record.rh_flag))

            // Icon parsing helper
            const iconsJson = JSON.stringify([record['ICON 1'], record['ICON 2'], record['ICON 3'], record['ICON 4'], record.ICON1, record.ICON2].filter(Boolean))

            // Juntamos accesorio y riel
            const accesoryArr = [record.Accesorio, record.Riel].filter(Boolean)
            const accessoryText = accesoryArr.length > 0 ? accesoryArr.join(' ') : null

            const cleanData = {
                code: rawCode,
                sap_description: sapDesc,

                // Derivados del parser
                familia_code: parsed.familia_code,
                ref_code: parsed.ref_code,
                version_code: parsed.version_code,
                color_code: parsed.color_code || record['Codigo C'] || null,
                rh_flag: parsed.rh_flag,
                product_type: record['Tipo de producto'] || parsed.product_type || null,
                use_destination: record.Hogar || parsed.use_destination || null,
                assembled_flag: record.Armado ? isTrue(record.Armado) : parsed.assembled_flag,

                // Nuevos campos CSV
                private_label_flag: isTrue(record['Clientes marca propia']),
                private_label_client_name: record['Clientes marca propia'] !== 'SI' && record['Clientes marca propia'] ? record['Clientes marca propia'] : null,
                designation: record.Designacion || null,
                furniture_name: record['Nombre mueble'] || null,
                line: record.Linea || null,
                commercial_measure: record.Medida || null,
                accessory_text: accessoryText,
                door_color_text: record['Color puertas'] || null,
                edge_2mm_flag: isTrue(record.Canto),
                final_name_es: record['DESCRIPCION FINAL'] || null,
                final_name_en: record['DESCRIPCION INGLES'] || null,
                isometric_path: record.ISOMETRICO || null,

                // Medidas y Peso numericos
                depth_cm: parseFloat(record.FONDO) || null,
                height_cm: parseFloat(record.ALTO) || null,
                width_cm: parseFloat(record.ANCHO) || null,
                weight_kg: parseFloat(record.PESO) || null,
                depth_in: parseFloat(record.D) || null,
                height_in: parseFloat(record.H) || null,
                width_in: parseFloat(record.W) || null,
                weight_lb: parseFloat(record.Wg) || null,

                // Iconos explícitos
                icon_rh: parsed.rh_flag || iconsJson.includes('RH'), // fallback a rules si no 
                icon_full_extension: String(record.Riel || '').toUpperCase().includes('FULL EXTENSION'),
                icon_soft_close: String(record.Accesorio || '').toUpperCase().includes('CIERRE LENTO') || iconsJson.includes('CIERRE LENTO'),
                icon_edge_2mm: isTrue(record.Canto),
            }

            await prisma.product.upsert({
                where: { code: cleanData.code },
                update: cleanData,
                create: cleanData,
            })

            successCount++
        }

        return NextResponse.json({ success: true, count: successCount })
    } catch (error) {
        console.error('Import Error:', error)
        return NextResponse.json({ error: 'Failed to process import' }, { status: 500 })
    }
}
