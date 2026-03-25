
import { dbQuery } from './web/src/lib/supabase';

async function run() {
    console.log("Iniciando repoblamiento de tabla Clientes...");
    const brands = ["CHILEMAT", "D-ACQUA", "PROMART", "FERMETAL"];
    
    for (const brand of brands) {
        const logoName = `Logo ${brand}`;
        try {
            // Intenta encontrar el logo en assets
            const assets = await dbQuery(`SELECT id FROM public.assets WHERE name = '${logoName}' LIMIT 1`);
            const logoId = assets && assets.length > 0 ? assets[0].id : null;
            
            // Inserta o actualiza el cliente
            await dbQuery(`
                INSERT INTO public.clients (id, name, logo_asset_id, created_at)
                VALUES (gen_random_uuid(), '${brand}', ${logoId ? `'${logoId}'` : 'NULL'}, now())
                ON CONFLICT (name) DO UPDATE SET 
                    logo_asset_id = EXCLUDED.logo_asset_id
            `);
            console.log(`✅ Cliente cargado: ${brand} (Logo ID: ${logoId || 'No encontrado'})`);
        } catch (e) {
            console.error(`❌ Error con marca ${brand}:`, e.message);
        }
    }
}

run();
