import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runTriggerDDL() {
    const { dbQuery } = await import('../src/lib/supabase');
    console.log("Creating dual-write trigger...");
    const ddl = `
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
            (family_code, reference_code, product_name, width_cm, depth_cm, height_cm, weight_kg, isometric_path, isometric_asset_id, status, ref_attrs)
        VALUES 
            (NEW.familia_code, NEW.ref_code, COALESCE(NEW.cabinet_name, ''),
            COALESCE(NEW.width_cm, 0), COALESCE(NEW.depth_cm, 0), COALESCE(NEW.height_cm, 0), COALESCE(NEW.weight_kg, 0),
            NEW.isometric_path, NEW.isometric_asset_id, COALESCE(NEW.status, 'ACTIVO'),
            jsonb_build_object(
                'rh', NEW.rh,
                'canto_puertas', NEW.canto_puertas,
                'bisagras', NEW.bisagras,
                'accessory_text', NEW.accessory_text,
                'door_color_text', NEW.door_color_text,
                'armado_con_lvm', NEW.armado_con_lvm,
                'carb2', NEW.carb2
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
            (version_id, sku_complete, color_code, sap_description_original, final_complete_name_es, final_complete_name_en, barcode_text, status)
        VALUES
            (v_ver_id, NEW.code, NEW.color_code, NEW.sap_description, 
             COALESCE(NEW.final_name_es, '') || CASE WHEN v_color_name IS NOT NULL THEN ' - ' || v_color_name ELSE '' END,
             COALESCE(NEW.final_name_en, '') || CASE WHEN v_color_name IS NOT NULL THEN ' - ' || v_color_name ELSE '' END,
             NEW.barcode_text,
             COALESCE(NEW.status, 'ACTIVO'))
        ON CONFLICT (sku_complete) DO UPDATE SET
            color_code = EXCLUDED.color_code,
            sap_description_original = EXCLUDED.sap_description_original,
            final_complete_name_es = EXCLUDED.final_complete_name_es,
            final_complete_name_en = EXCLUDED.final_complete_name_en,
            barcode_text = EXCLUDED.barcode_text,
            status = EXCLUDED.status;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sync_product_v6 ON public.cabinet_products;
    CREATE TRIGGER trg_sync_product_v6
    AFTER INSERT OR UPDATE ON public.cabinet_products
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_to_v6();
    `;

    try {
        await dbQuery(ddl);
        console.log("Trigger execution successful.");
    } catch (e: any) {
        console.error("Error executing trigger DDL:", e.message);
    }
}

runTriggerDDL();
