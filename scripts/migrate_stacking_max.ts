import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function migrateStackingMax() {
    console.log("=== MIGRATING STACKING MAX ===\n");

    try {
        // 1. Add column to product_references
        console.log("Adding stacking_max column to product_references...");
        await dbQuery(`ALTER TABLE public.product_references ADD COLUMN IF NOT EXISTS stacking_max integer`);
        console.log("Done.\n");

        // 2. Migrate data
        console.log("Migrating stacking_max data from cabinet_products...");
        // Since stacking_max is a physical property of the reference, we take it from version '000' or any available.
        await dbQuery(`
            UPDATE public.product_references pr
            SET stacking_max = sub.stacking_max
            FROM (
                SELECT DISTINCT ON (familia_code, ref_code) familia_code, ref_code, stacking_max
                FROM public.cabinet_products
                WHERE stacking_max IS NOT NULL
                ORDER BY familia_code, ref_code, version_code
            ) sub
            WHERE pr.family_code = sub.familia_code 
              AND pr.reference_code = sub.ref_code
        `);
        console.log("Done.\n");

        // 3. Update Trigger
        console.log("Updating trigger to include stacking_max...");
        const triggerDdl = `
        CREATE OR REPLACE FUNCTION public.sync_product_to_v6()
        RETURNS trigger AS $$
        DECLARE
            v_ref_id uuid;
            v_ver_id uuid;
            v_color_name text;
        BEGIN
            -- 0. Get Color Name
            SELECT name_color_sap INTO v_color_name FROM public.colors WHERE code_4dig = NEW.color_code;

            -- 1. Upsert Reference
            INSERT INTO public.product_references 
                (family_code, reference_code, product_name, designation, line, commercial_measure, special_label, width_cm, depth_cm, height_cm, weight_kg, stacking_max, isometric_path, isometric_asset_id, status, ref_attrs)
            VALUES 
                (NEW.familia_code, NEW.ref_code, COALESCE(NEW.cabinet_name, ''),
                NEW.designation, NEW.line, NEW.commercial_measure, 
                CASE WHEN NEW.version_code = '000' THEN NEW.special_label ELSE NULL END,
                COALESCE(NEW.width_cm, 0), COALESCE(NEW.depth_cm, 0), COALESCE(NEW.height_cm, 0), COALESCE(NEW.weight_kg, 0), NEW.stacking_max,
                NEW.isometric_path, NEW.isometric_asset_id, COALESCE(NEW.status, 'ACTIVO'),
                jsonb_build_object(
                    'rh', NEW.rh, 'canto_puertas', NEW.canto_puertas, 'bisagras', NEW.bisagras,
                    'accessory_text', NEW.accessory_text, 'door_color_text', NEW.door_color_text,
                    'armado_con_lvm', NEW.armado_con_lvm, 'carb2', NEW.carb2
                )
                )
            ON CONFLICT (family_code, reference_code) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                designation = COALESCE(EXCLUDED.designation, product_references.designation),
                line = COALESCE(EXCLUDED.line, product_references.line),
                commercial_measure = COALESCE(EXCLUDED.commercial_measure, product_references.commercial_measure),
                special_label = COALESCE(EXCLUDED.special_label, product_references.special_label),
                width_cm = EXCLUDED.width_cm,
                depth_cm = EXCLUDED.depth_cm,
                height_cm = EXCLUDED.height_cm,
                weight_kg = EXCLUDED.weight_kg,
                stacking_max = COALESCE(EXCLUDED.stacking_max, product_references.stacking_max),
                isometric_path = EXCLUDED.isometric_path,
                isometric_asset_id = EXCLUDED.isometric_asset_id,
                status = EXCLUDED.status,
                ref_attrs = EXCLUDED.ref_attrs
            RETURNING id INTO v_ref_id;

            -- 2. Upsert Version
            INSERT INTO public.product_versions
                (reference_id, version_code, sku_base, final_base_name_es, final_base_name_en, version_label, validation_status, status)
            VALUES
                (v_ref_id, NEW.version_code, NEW.sku_base, NEW.final_name_es, NEW.final_name_en, 
                CASE WHEN NEW.version_code != '000' THEN NEW.special_label ELSE NULL END,
                COALESCE(NEW.validation_status, 'incomplete'), COALESCE(NEW.status, 'ACTIVO'))
            ON CONFLICT (reference_id, version_code) DO UPDATE SET
                sku_base = EXCLUDED.sku_base,
                final_base_name_es = EXCLUDED.final_base_name_es,
                final_base_name_en = EXCLUDED.final_base_name_en,
                version_label = COALESCE(EXCLUDED.version_label, product_versions.version_label),
                validation_status = EXCLUDED.validation_status,
                status = EXCLUDED.status
            RETURNING id INTO v_ver_id;

            -- 3. Upsert SKU
            INSERT INTO public.product_skus
                (version_id, sku_complete, sap_description_original, final_complete_name_es, final_complete_name_en, status)
            VALUES
                (v_ver_id, NEW.code, NEW.sap_description, 
                 COALESCE(NEW.final_name_es, '') || CASE WHEN v_color_name IS NOT NULL THEN ' - ' || v_color_name ELSE '' END,
                 COALESCE(NEW.final_name_en, '') || CASE WHEN v_color_name IS NOT NULL THEN ' - ' || v_color_name ELSE '' END,
                 COALESCE(NEW.status, 'ACTIVO'))
            ON CONFLICT (sku_complete) DO UPDATE SET
                sap_description_original = EXCLUDED.sap_description_original,
                final_complete_name_es = EXCLUDED.final_complete_name_es,
                final_complete_name_en = EXCLUDED.final_complete_name_en,
                status = EXCLUDED.status;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        `;
        await dbQuery(triggerDdl);
        console.log("Done.\n");

        console.log("=== MIGRATION COMPLETE ===");

    } catch (e: any) {
        console.error("FATAL Error:", e.message);
    }
}

migrateStackingMax().catch(e => console.error("FATAL:", e.message));
