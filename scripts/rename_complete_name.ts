import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function renameCompleteNameCols() {
    console.log("=== RENAMING COMPLETE NAME COLUMNS ===\n");

    try {
        // 1. Rename columns in product_skus
        console.log("Step 1: Renaming columns in product_skus...");
        await dbQuery(`ALTER TABLE public.product_skus RENAME COLUMN final_name_complete_es TO final_complete_name_es`);
        await dbQuery(`ALTER TABLE public.product_skus RENAME COLUMN final_name_complete_en TO final_complete_name_en`);
        console.log("Done.");

        // 2. Update the trigger function
        console.log("Step 2: Updating trigger function sync_product_to_v6...");
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
                (family_code, reference_code, product_name, product_type, width_cm, depth_cm, height_cm, weight_kg, isometric_path, isometric_asset_id, status, ref_attrs)
            VALUES 
                (NEW.familia_code, NEW.ref_code, COALESCE(NEW.cabinet_name, ''), 'MUEBLE', 
                COALESCE(NEW.width_cm, 0), COALESCE(NEW.depth_cm, 0), COALESCE(NEW.height_cm, 0), COALESCE(NEW.weight_kg, 0),
                NEW.isometric_path, NEW.isometric_asset_id, COALESCE(NEW.status, 'ACTIVO'),
                jsonb_build_object(
                    'rh', NEW.rh, 'canto_puertas', NEW.canto_puertas, 'bisagras', NEW.bisagras,
                    'accessory_text', NEW.accessory_text, 'door_color_text', NEW.door_color_text,
                    'armado_con_lvm', NEW.armado_con_lvm, 'carb2', NEW.carb2
                )
                )
            ON CONFLICT (family_code, reference_code) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                width_cm = EXCLUDED.width_cm,
                depth_cm = EXCLUDED.depth_cm,
                height_cm = EXCLUDED.height_cm,
                weight_kg = EXCLUDED.weight_kg,
                isometric_path = EXCLUDED.isometric_path,
                isometric_asset_id = EXCLUDED.isometric_asset_id,
                status = EXCLUDED.status,
                ref_attrs = EXCLUDED.ref_attrs
            RETURNING id INTO v_ref_id;

            -- 2. Upsert Version
            INSERT INTO public.product_versions
                (reference_id, version_code, sku_base, final_base_name_es, final_base_name_en, validation_status, status)
            VALUES
                (v_ref_id, NEW.version_code, NEW.sku_base, NEW.final_name_es, NEW.final_name_en, COALESCE(NEW.validation_status, 'incomplete'), COALESCE(NEW.status, 'ACTIVO'))
            ON CONFLICT (reference_id, version_code) DO UPDATE SET
                sku_base = EXCLUDED.sku_base,
                final_base_name_es = EXCLUDED.final_base_name_es,
                final_base_name_en = EXCLUDED.final_base_name_en,
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
        console.log("Done.");

        console.log("\n=== RENAME COMPLETE ===");
    } catch (e: any) {
        console.error("FATAL Error:", e.message);
    }
}

renameCompleteNameCols().catch(e => console.error("FATAL:", e.message));
