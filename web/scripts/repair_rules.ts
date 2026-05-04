import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function repairRules() {
    console.log("Repairing Global Version Rules...\n");
    
    const missingCodes = [
        { code: 'MRH', desc: 'Madera Resistente a la Humedad (RH)' },
        { code: 'MDT', desc: 'Madera CARB2 / Tablero Densidad Media' },
        { code: 'PTT', desc: 'Versión Prototipo / Experimental' },
        { code: 'CME', desc: 'Versión Especial (Picasso Life / Otros)' }
    ];

    for (const item of missingCodes) {
        await dbQuery(`
            INSERT INTO public.global_version_rules (code, description, status, product_types)
            VALUES ($1, $2, 'ACTIVO', '["MUEBLE"]'::jsonb)
            ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
        `, [item.code, item.desc]);
        console.log(`Added/Updated version rule: ${item.code}`);
    }
}

repairRules();
