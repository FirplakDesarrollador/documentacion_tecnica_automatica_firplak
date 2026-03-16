import prisma from '@/lib/prisma'
import { MassEditClient } from './MassEditClient'

export default async function MassEditPage() {
    // Fetch all products or a large set for mass editing
    const products = await prisma.product.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true,
            code: true,
            familia_code: true,
            ref_code: true,
            furniture_name: true,
            edge_2mm_flag: true,
            rh_flag: true,
            assembled_flag: true,
            commercial_measure: true,
            accessory_text: true,
            validation_status: true,
            sap_description: true,
            line: true,
            zone_text: true,
            color_code: true,
            width_cm: true,
            depth_cm: true,
            height_cm: true,
        }
    })

    // Fetch all families for name association
    const familiasDb = await prisma.familia.findMany({
        select: { code: true, name: true },
        orderBy: { code: 'asc' }
    })
    const families = familiasDb.map(f => ({
        value: f.code,
        label: `${f.code} - ${f.name}`
    }))

    return (
        <div className="container py-8">
            <MassEditClient products={products} families={families} />
        </div>
    )
}
