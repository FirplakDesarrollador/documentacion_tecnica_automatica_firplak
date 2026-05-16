-- Mass Import V6: wrapper that supports creating missing global_version_rules from payload.versions
-- without modifying the existing bulk_import_products_v2 implementation.
--
-- Key behavior:
-- - p_dry_run=true: runs the full import inside a subtransaction and forces rollback, returning the report.
--   This allows preview to validate brand-new families/colors/versions without persisting anything.
-- - p_dry_run=false: persists versions (if provided) and then delegates to bulk_import_products_v2.

CREATE OR REPLACE FUNCTION public.bulk_import_products_v3(
  p_payload jsonb,
  p_dry_run boolean DEFAULT true,
  p_test_rollback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_versions jsonb := COALESCE(p_payload->'versions', '[]'::jsonb);
  v_has_product_types boolean := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_version_rules'
      AND column_name = 'product_types'
  );
  v_product_types_data_type text := (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_version_rules'
      AND column_name = 'product_types'
    LIMIT 1
  );

  v_res jsonb := NULL;
  v_rolled_back boolean := false;
  ver record;
BEGIN
  -- Wrap everything so we can rollback in preview mode while still returning the report.
  BEGIN
    -- 0) Create/Upsert global_version_rules if provided
    IF jsonb_typeof(v_versions) = 'array' AND jsonb_array_length(v_versions) > 0 THEN
      FOR ver IN
        SELECT * FROM jsonb_to_recordset(v_versions) AS x(
          version_code text,
          version_description text,
          automatic_version_rules jsonb,
          product_types text[]
        )
      LOOP
        IF ver.version_code IS NULL OR btrim(ver.version_code) = '' THEN
          RAISE EXCEPTION 'versions.version_code is required';
        END IF;

        IF v_has_product_types THEN
          IF v_product_types_data_type = 'jsonb' THEN
            INSERT INTO public.global_version_rules (version_code, version_description, automatic_version_rules, product_types)
            VALUES (
              upper(ver.version_code),
              NULLIF(ver.version_description, ''),
              COALESCE(ver.automatic_version_rules, '{}'::jsonb),
              to_jsonb(COALESCE(ver.product_types, '{}'::text[]))
            )
            ON CONFLICT (version_code) DO UPDATE SET
              version_description = COALESCE(NULLIF(EXCLUDED.version_description,''), global_version_rules.version_description),
              automatic_version_rules = COALESCE(EXCLUDED.automatic_version_rules, global_version_rules.automatic_version_rules),
              product_types = COALESCE(EXCLUDED.product_types, global_version_rules.product_types);
          ELSE
            INSERT INTO public.global_version_rules (version_code, version_description, automatic_version_rules, product_types)
            VALUES (
              upper(ver.version_code),
              NULLIF(ver.version_description, ''),
              COALESCE(ver.automatic_version_rules, '{}'::jsonb),
              COALESCE(ver.product_types, '{}'::text[])
            )
            ON CONFLICT (version_code) DO UPDATE SET
              version_description = COALESCE(NULLIF(EXCLUDED.version_description,''), global_version_rules.version_description),
              automatic_version_rules = COALESCE(EXCLUDED.automatic_version_rules, global_version_rules.automatic_version_rules),
              product_types = CASE
                WHEN array_length(EXCLUDED.product_types, 1) IS NULL THEN global_version_rules.product_types
                ELSE EXCLUDED.product_types
              END;
          END IF;
        ELSE
          INSERT INTO public.global_version_rules (version_code, version_description, automatic_version_rules)
          VALUES (
            upper(ver.version_code),
            NULLIF(ver.version_description, ''),
            COALESCE(ver.automatic_version_rules, '{}'::jsonb)
          )
          ON CONFLICT (version_code) DO UPDATE SET
            version_description = COALESCE(NULLIF(EXCLUDED.version_description,''), global_version_rules.version_description),
            automatic_version_rules = COALESCE(EXCLUDED.automatic_version_rules, global_version_rules.automatic_version_rules);
        END IF;
      END LOOP;
    END IF;

    -- 1) Delegate to v2 for the heavy validation + inserts
    -- NOTE: We intentionally call v2 with p_dry_run=false in preview mode so it will behave like a real import,
    -- and then we rollback the entire block.
    v_res := public.bulk_import_products_v2(
      p_payload,
      CASE WHEN p_dry_run THEN false ELSE p_dry_run END,
      false
    );

    IF p_dry_run OR p_test_rollback THEN
      RAISE EXCEPTION 'TEST_ROLLBACK';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      IF (p_dry_run OR p_test_rollback) AND SQLERRM = 'TEST_ROLLBACK' THEN
        v_rolled_back := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF v_res IS NULL THEN
    v_res := jsonb_build_object('success', false, 'rows', '[]'::jsonb);
  END IF;

  -- Ensure the response reflects the caller intent.
  RETURN jsonb_set(
    jsonb_set(
      v_res,
      '{dry_run}',
      to_jsonb(p_dry_run),
      true
    ),
    '{rolled_back}',
    to_jsonb(v_rolled_back),
    true
  );
END;
$$;
