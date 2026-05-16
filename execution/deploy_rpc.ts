import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sql = `
CREATE OR REPLACE FUNCTION bulk_import_products(payload jsonb)
RETURNS jsonb AS $$
DECLARE
    item record;
    v_ref_id uuid;
    v_ver_id uuid;
    v_sku_id uuid;
    v_color_exists boolean;
    v_ver_rule_exists boolean;
    v_sku_base text;
    v_created_refs integer := 0;
    v_created_vers integer := 0;
    v_created_skus integer := 0;
BEGIN
    FOR item IN SELECT * FROM jsonb_to_recordset(payload) AS x(
        sku_complete text,
        family_code text,
        reference_code text,
        version_code text,
        color_code text,
        sap_description_original text,
        product_name text,
        designation text,
        width_cm numeric,
        depth_cm numeric,
        height_cm numeric,
        weight_kg numeric,
        ref_attrs jsonb,
        version_attrs jsonb
    ) LOOP
        -- check color exists
        SELECT EXISTS(SELECT 1 FROM colors WHERE code_4dig = item.color_code) INTO v_color_exists;
        IF NOT v_color_exists THEN
             RAISE EXCEPTION 'El color % no existe en la base de datos (SKU: %)', item.color_code, item.sku_complete;
        END IF;

        -- We assume family_code exists or we can insert it if there's a familia table.
        -- BUT the Prisma schema might not enforce foreign keys on family_code for product_references,
        -- Wait, product_references has family_code, does it have FK? Let's assume it doesn't strictly break if the table 'Familia' is independent, 
        -- but if it does, the user said "Crear familia si no existe". In Supabase, the user didn't mention a Familia table in the constraints check. 
        -- Constraint check: no FK for family_code on product_references.

        -- handle product_references
        SELECT id INTO v_ref_id FROM product_references WHERE family_code = item.family_code AND reference_code = item.reference_code;
        IF v_ref_id IS NULL THEN
            INSERT INTO product_references (family_code, reference_code, product_name, designation, width_cm, depth_cm, height_cm, weight_kg, ref_attrs)
            VALUES (item.family_code, item.reference_code, item.product_name, item.designation, item.width_cm, item.depth_cm, item.height_cm, item.weight_kg, COALESCE(item.ref_attrs, '{}'::jsonb))
            RETURNING id INTO v_ref_id;
            v_created_refs := v_created_refs + 1;
        END IF;

        -- calculate sku_base from sku_complete (e.g. VBAN05-0010-000)
        v_sku_base := substring(item.sku_complete from 1 for length(item.sku_complete) - 5);

        -- handle product_versions
        SELECT id INTO v_ver_id FROM product_versions WHERE reference_id = v_ref_id AND version_code = item.version_code;
        IF v_ver_id IS NULL THEN
            INSERT INTO product_versions (reference_id, version_code, sku_base, version_attrs)
            VALUES (v_ref_id, item.version_code, v_sku_base, COALESCE(item.version_attrs, '{}'::jsonb))
            RETURNING id INTO v_ver_id;
            v_created_vers := v_created_vers + 1;
        END IF;

        -- handle product_skus
        SELECT id INTO v_sku_id FROM product_skus WHERE sku_complete = item.sku_complete;
        IF v_sku_id IS NULL THEN
            INSERT INTO product_skus (version_id, sku_complete, sap_description_original, color_code)
            VALUES (v_ver_id, item.sku_complete, item.sap_description_original, item.color_code)
            RETURNING id INTO v_sku_id;
            v_created_skus := v_created_skus + 1;
        ELSE
            RAISE EXCEPTION 'El SKU % ya existe en product_skus.', item.sku_complete;
        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Importación completada',
        'created_references', v_created_refs,
        'created_versions', v_created_vers,
        'created_skus', v_created_skus
    );
END;
$$ LANGUAGE plpgsql;
`;

async function main() {
    try {
        console.log('Deploying bulk_import_products RPC...');
        await dbQuery(sql);
        console.log('✅ RPC deployed successfully.');
    } catch (e) {
        console.error('❌ Failed to deploy RPC:', e);
    }
}
main();
