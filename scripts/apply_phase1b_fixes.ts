import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function applyCorrections() {
    console.log("=== APPLYING PHASE 1B CERTIFICATION CORRECTIONS ===\n");

    // 1. Confirm FK integrity
    console.log("1. Verificando FK de Color...");
    const fks = await dbQuery(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'public.product_skus'::regclass AND conname = 'fk_skus_color_code'
    `);
    if (fks.length > 0) {
        console.log("   ✓ FK 'fk_skus_color_code' está ACTIVA y VÁLIDA.");
    } else {
        console.log("   ❌ FK no encontrada. Intentando crear...");
        await dbQuery(`ALTER TABLE public.product_skus ADD CONSTRAINT fk_skus_color_code FOREIGN KEY (color_code) REFERENCES public.colors(code_4dig)`);
        console.log("   ✓ FK creada.");
    }

    // 2. Fix Master Weight for Reference 0130 (Family BAN05)
    console.log("\n2. Corrigiendo peso maestro para BAN05-0130...");
    await dbQuery(`
        UPDATE public.product_references
        SET weight_kg = 17.3
        WHERE family_code = 'BAN05' AND reference_code = '0130'
    `);
    console.log("   ✓ Peso actualizado a 17.3.");

    // 3. Fix Accessory Override for Version CME (Reference 0130)
    console.log("\n3. Aplicando override de accesorio para versión CME...");
    const versionRes = await dbQuery(`
        SELECT v.id 
        FROM public.product_versions v
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE r.family_code = 'BAN05' AND r.reference_code = '0130' AND v.version_code = 'CME'
    `);

    if (versionRes.length > 0) {
        const versionId = versionRes[0].id;
        await dbQuery(`
            UPDATE public.product_versions
            SET version_attrs = version_attrs || '{"accessory_text": "RFE + MANIJA NEGRA 520"}'::jsonb
            WHERE id = $1
        `, [versionId]);
        console.log("   ✓ Override de accessory_text aplicado.");
    } else {
        console.log("   ⚠️ Versión CME no encontrada para BAN05-0130.");
    }

    console.log("\n=== CORRECCIONES FINALIZADAS ===");
}

applyCorrections().catch(e => console.error("FATAL:", e.message));
