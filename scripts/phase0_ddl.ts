import * as dotenv from 'dotenv';
import path from 'path';

// Load env before anything else
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { dbQuery } from '../src/lib/supabase';

async function runDDL() {
    console.log("Starting DDL creation...");
    const ddl = `
    CREATE TABLE IF NOT EXISTS public.families (
        code text PRIMARY KEY,
        name text NOT NULL,
        manufacturing_process text NOT NULL DEFAULT 'CABINET',
        product_type text,
        rh_default boolean DEFAULT false,
        assembled_default boolean DEFAULT false,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.global_version_rules (
        code text PRIMARY KEY,
        description text NOT NULL,
        product_types jsonb DEFAULT '[]'::jsonb,
        status text DEFAULT 'ACTIVO',
        automatic_rules jsonb DEFAULT '{}'::jsonb,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.product_references (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        family_code text REFERENCES public.families(code) ON DELETE RESTRICT,
        reference_code text NOT NULL,
        product_name text NOT NULL,
        product_type text,
        use_destination text,
        designation text,
        line text,
        commercial_measure text,
        width_cm numeric,
        depth_cm numeric,
        height_cm numeric,
        weight_kg numeric,
        zone_home text,
        special_label text,
        isometric_path text,
        isometric_asset_id text,
        status text DEFAULT 'ACTIVO',
        ref_attrs jsonb DEFAULT '{}'::jsonb,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        UNIQUE(family_code, reference_code)
    );

    CREATE TABLE IF NOT EXISTS public.product_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference_id uuid REFERENCES public.product_references(id) ON DELETE CASCADE,
        version_code text REFERENCES public.global_version_rules(code) ON DELETE RESTRICT,
        sku_base text NOT NULL UNIQUE,
        final_base_name_es text,
        final_base_name_en text,
        validation_status text DEFAULT 'incomplete',
        status text DEFAULT 'ACTIVO',
        version_attrs jsonb DEFAULT '{}'::jsonb,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        UNIQUE(reference_id, version_code)
    );

    CREATE TABLE IF NOT EXISTS public.product_skus (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version_id uuid REFERENCES public.product_versions(id) ON DELETE CASCADE,
        sku_complete text NOT NULL UNIQUE,
        sap_description_original text,
        sap_description_recommended text,
        barcode_text text,
        barcode_path text,
        final_name_complete_es text,
        final_name_complete_en text,
        status text DEFAULT 'ACTIVO',
        sku_attrs jsonb DEFAULT '{}'::jsonb,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_skus_sku_complete ON public.product_skus(sku_complete);
    CREATE INDEX IF NOT EXISTS idx_skus_sku_base ON public.product_skus(sku_complete); -- Index on the prefix? No, let's keep it simple.
    -- CREATE INDEX IF NOT EXISTS idx_skus_color_code ON public.product_skus(color_code); -- Removed
    -- CREATE INDEX IF NOT EXISTS idx_skus_family_code ON public.product_skus(family_code); -- Removed
    -- CREATE INDEX IF NOT EXISTS idx_skus_reference_code ON public.product_skus(reference_code); -- Removed
    CREATE INDEX IF NOT EXISTS idx_refs_family_ref ON public.product_references(family_code, reference_code);
    `;

    try {
        await dbQuery(ddl);
        console.log("DDL execution successful.");
    } catch (e: any) {
        console.error("Error executing DDL:", e.message);
    }
}

runDDL();
