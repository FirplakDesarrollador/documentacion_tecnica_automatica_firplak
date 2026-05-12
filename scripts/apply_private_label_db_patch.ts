import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery } from '../src/lib/supabase'

function json(obj: any) {
    return JSON.stringify(obj)
}

async function main() {
    console.log('=== PATCH: private label version rules (DB-first) ===\n')

    // 1) Functions
    console.log('1) Creating functions...')
    await dbQuery(`
        CREATE OR REPLACE FUNCTION public.get_version_automatic_rules(p_version_code text)
        RETURNS jsonb
        LANGUAGE sql
        STABLE
        AS $$
            SELECT COALESCE(
                (SELECT automatic_version_rules
                 FROM public.global_version_rules
                 WHERE version_code = p_version_code
                 LIMIT 1),
                '{}'::jsonb
            );
        $$;
    `)

    await dbQuery(`
        CREATE OR REPLACE FUNCTION public.compute_effective_version_attrs(p_version_code text, p_version_attrs jsonb)
        RETURNS jsonb
        LANGUAGE sql
        STABLE
        AS $$
            SELECT public.get_version_automatic_rules(p_version_code) || COALESCE(p_version_attrs, '{}'::jsonb);
        $$;
    `)

    await dbQuery(`
        CREATE OR REPLACE FUNCTION public.compute_private_label_client_name(p_version_code text, p_version_attrs jsonb)
        RETURNS text
        LANGUAGE plpgsql
        STABLE
        AS $$
        DECLARE
            v_name text;
        BEGIN
            v_name := public.compute_effective_version_attrs(p_version_code, p_version_attrs)->>'private_label_client_name';
            v_name := NULLIF(btrim(COALESCE(v_name, '')), '');
            IF v_name IS NULL THEN
                RETURN NULL;
            END IF;
            IF upper(v_name) = 'NA' THEN
                RETURN NULL;
            END IF;
            RETURN v_name;
        END;
        $$;
    `)
    console.log('   OK.\n')

    // 2) View update
    console.log('2) Updating view public.v_ui_generate_list...')
    // Note: CREATE OR REPLACE VIEW cannot drop columns; we must DROP + CREATE to remove private_label_flag safely.
    await dbQuery(`DROP VIEW IF EXISTS public.v_ui_generate_list;`)
    await dbQuery(`
        CREATE OR REPLACE VIEW public.v_ui_generate_list AS
        SELECT
            s.id, s.sku_complete, s.color_code, s.sap_description_original,
            s.final_complete_name_es, s.final_complete_name_en,
            s.barcode_text, s.barcode_path, s.status, s.sku_attrs,

            v.version_code, v.sku_base, v.final_base_name_es,
            v.final_base_name_en, v.validation_status,
            v.version_label, v.version_attrs,

            r.reference_code, r.product_name,
            r.designation, r.line, r.commercial_measure,
            r.special_label, r.width_cm, r.depth_cm, r.height_cm,
            r.weight_kg, r.stacking_max, r.isometric_path,
            r.isometric_asset_id, r.ref_attrs,

            f.family_code, f.family_name, f.product_type, f.zone_home,
            f.use_destination, f.manufacturing_process,
            f.assembled_default, f.rh_default, f.allowed_lines,

            gvr.automatic_version_rules,

            c.name_color_sap,

            -- Added columns must be appended (CREATE OR REPLACE VIEW limitation)
            public.compute_effective_version_attrs(v.version_code, v.version_attrs) AS effective_version_attrs,
            public.compute_private_label_client_name(v.version_code, v.version_attrs) AS private_label_client_name
        FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        JOIN public.product_references r ON v.reference_id = r.id
        JOIN public.families f ON r.family_code = f.family_code
        LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
        LEFT JOIN public.colors c ON s.color_code = c.code_4dig;

        COMMENT ON VIEW public.v_ui_generate_list IS 'READ-ONLY UI MODEL: Vista exclusiva para listados pesados (ej. Módulo Generar). NO ES FUENTE DE VERDAD. Prohibido agregar columnas técnicas por proceso (usar JSONB attrs).';
    `)
    console.log('   OK.\n')

    // 3) Strict version_code existence validation
    console.log('3) Creating strict trigger on public.product_versions...')
    await dbQuery(`
        CREATE OR REPLACE FUNCTION public.enforce_version_code_exists()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF NEW.version_code IS NULL OR btrim(NEW.version_code) = '' THEN
                RAISE EXCEPTION 'version_code es requerido en product_versions.';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.global_version_rules
                WHERE version_code = NEW.version_code
            ) THEN
                RAISE EXCEPTION 'version_code % no existe en global_version_rules. Crea la versión primero (versions UI / seed) y reintenta.', NEW.version_code;
            END IF;

            RETURN NEW;
        END;
        $$;
    `)

    await dbQuery(`DROP TRIGGER IF EXISTS trg_enforce_version_code_exists ON public.product_versions;`)
    await dbQuery(`
        CREATE TRIGGER trg_enforce_version_code_exists
        BEFORE INSERT OR UPDATE OF version_code
        ON public.product_versions
        FOR EACH ROW
        EXECUTE FUNCTION public.enforce_version_code_exists();
    `)
    console.log('   OK.\n')

    // 4) Upsert rules (private label)
    console.log('4) Upserting automatic_version_rules (private label)...')

    const rules: Array<{ version_code: string; version_description: string; automatic_version_rules: any }> = [
        {
            version_code: 'MDT',
            version_description: 'Marca Propia MEDITERRANEO',
            automatic_version_rules: { carb2: 'CARB2', private_label_client_name: 'MEDITERRANEO' },
        },
        {
            version_code: 'FMT',
            version_description: 'FERMETAL',
            automatic_version_rules: { private_label_client_name: 'FERMETAL' },
        },
        {
            version_code: 'PRO',
            version_description: 'PROMART',
            automatic_version_rules: { private_label_client_name: 'PROMART' },
        },
        {
            version_code: 'SCH',
            version_description: 'SODIMAC CHILE',
            automatic_version_rules: { private_label_client_name: 'SODIMAC CHILE' },
        },
        {
            version_code: 'CHT',
            version_description: 'CHILEMAT',
            automatic_version_rules: { private_label_client_name: 'CHILEMAT' },
        },
        {
            version_code: 'DAC',
            version_description: 'D-ACQUA',
            automatic_version_rules: { private_label_client_name: 'D-ACQUA' },
        },
    ]

    for (const r of rules) {
        await dbQuery(
            `
            INSERT INTO public.global_version_rules (
                version_code, version_description, status, product_types, automatic_version_rules
            ) VALUES (
                $1, $2, 'ACTIVO', '["MUEBLE"]'::jsonb, $3::jsonb
            )
            ON CONFLICT (version_code) DO UPDATE SET
                version_description = COALESCE(EXCLUDED.version_description, public.global_version_rules.version_description),
                automatic_version_rules = COALESCE(public.global_version_rules.automatic_version_rules, '{}'::jsonb) || EXCLUDED.automatic_version_rules,
                updated_at = NOW()
            `,
            [r.version_code, r.version_description, json(r.automatic_version_rules)]
        )
        console.log(`   ${r.version_code}: ${json(r.automatic_version_rules)}`)
    }

    console.log('\n4.5) Removing deprecated key automatic_version_rules.private_label_flag (if present)...')
    await dbQuery(`
        UPDATE public.global_version_rules
        SET automatic_version_rules = COALESCE(automatic_version_rules, '{}'::jsonb) - 'private_label_flag',
            updated_at = NOW()
        WHERE version_code IN ('MDT','FMT','PRO','SCH','CHT','DAC')
    `)

    console.log('\n5) Reloading PostgREST schema...')
    await dbQuery(`NOTIFY pgrst, 'reload schema';`)

    console.log('\n=== PATCH DONE ===')
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})
