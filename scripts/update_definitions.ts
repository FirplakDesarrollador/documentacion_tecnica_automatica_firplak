import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function fixAndStoreDefinitions() {
    console.log("Adding version_attrs to global_version_rules and updating definitions...\n");
    
    try {
        // 1. Add column if not exists
        await dbQuery(`ALTER TABLE public.global_version_rules ADD COLUMN IF NOT EXISTS version_attrs jsonb DEFAULT '{}'::jsonb`);
        console.log("Ensured version_attrs column exists in global_version_rules.");

        const updates = [
            { 
                code: 'MDT', 
                desc: 'Marca Propia MEDITERRANEO (Material CARB2)',
                attrs: { brand: 'MEDITERRANEO', material: 'CARB2', is_private_label: true }
            },
            { 
                code: 'CME', 
                desc: 'CON MANIJA ESPECIAL (Incluye Manija Negra 520)',
                attrs: { accessory_override: 'MANIJA NEGRA 520' }
            },
            { 
                code: 'PTT', 
                desc: 'PROTOTIPO (Versión de desarrollo/experimental)',
                attrs: { development_stage: 'prototype' }
            },
            { 
                code: 'MRH', 
                desc: 'Madera Resistente a la Humedad (RH)',
                attrs: { material: 'RH' }
            }
        ];

        for (const item of updates) {
            await dbQuery(`
                UPDATE public.global_version_rules 
                SET description = $1, 
                    version_attrs = COALESCE(version_attrs, '{}'::jsonb) || $2::jsonb
                WHERE code = $3
            `, [item.desc, JSON.stringify(item.attrs), item.code]);
            console.log(`Updated rule: ${item.code} -> ${item.desc}`);
        }
        
        console.log("\nProcess complete.");
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

fixAndStoreDefinitions();
