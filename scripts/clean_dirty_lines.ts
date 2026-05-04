import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const lines = await prisma.$queryRaw`SELECT DISTINCT line FROM public.cabinet_products WHERE line IS NOT NULL AND line != ''`;
    console.log("Found lines:", lines);

    // Let's also see if any match a color name
    const dirty = await prisma.$queryRaw`
        SELECT DISTINCT p.line 
        FROM public.cabinet_products p
        JOIN public.color c ON LOWER(p.line) = LOWER(c.name_color_sap)
        WHERE p.line IS NOT NULL AND p.line != ''
    `;
    console.log("Lines matching colors:", dirty);

    if (Array.isArray(dirty) && dirty.length > 0) {
        const dirtyNames = dirty.map(d => d.line);
        await prisma.$queryRaw`
            UPDATE public.cabinet_products 
            SET line = NULL 
            WHERE line IN (${dirtyNames.join("','")})
        `;
        console.log("Fixed dirty lines!");
    } else {
        // Just in case they are not in Color table but are colors like 'BLANCO', 'NEGRO', 'TABACO', etc.
        const manualColors = ['BLANCO', 'NEGRO', 'TABACO', 'MIEL', 'CENIZA', 'WENGUE', 'ROVERE', 'MACADAMIA', 'NEVADO', 'ARCE', 'COBALTO'];
        for (const c of manualColors) {
            await prisma.$executeRawUnsafe(`UPDATE public.cabinet_products SET line = NULL WHERE UPPER(line) LIKE '%${c}%'`);
        }
        console.log("Applied manual clean");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
