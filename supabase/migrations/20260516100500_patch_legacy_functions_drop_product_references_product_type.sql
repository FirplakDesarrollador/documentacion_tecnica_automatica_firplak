DO $$
BEGIN
  -- Keep legacy function name but remove writes to product_references.product_type.
  -- If not present, this is a no-op.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bulk_import_products'
      AND p.prokind = 'f'
      AND oidvectortypes(p.proargtypes) = 'jsonb'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.bulk_import_products(payload jsonb)
      RETURNS jsonb AS $bulk$
      DECLARE
          item record;
          v_ref_id uuid;
          v_ver_id uuid;
          v_sku_id uuid;
          v_color_exists boolean;
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
              SELECT EXISTS(SELECT 1 FROM public.colors WHERE code_4dig = item.color_code) INTO v_color_exists;
              IF NOT v_color_exists THEN
                   RAISE EXCEPTION 'El color % no existe en la base de datos (SKU: %)', item.color_code, item.sku_complete;
              END IF;

              SELECT id INTO v_ref_id
              FROM public.product_references
              WHERE family_code = item.family_code AND reference_code = item.reference_code;

              IF v_ref_id IS NULL THEN
                  INSERT INTO public.product_references (
                      family_code, reference_code, product_name, designation,
                      width_cm, depth_cm, height_cm, weight_kg, ref_attrs
                  )
                  VALUES (
                      item.family_code, item.reference_code, item.product_name, item.designation,
                      item.width_cm, item.depth_cm, item.height_cm, item.weight_kg, COALESCE(item.ref_attrs, '{}'::jsonb)
                  )
                  RETURNING id INTO v_ref_id;
                  v_created_refs := v_created_refs + 1;
              END IF;

              v_sku_base := substring(item.sku_complete from 1 for length(item.sku_complete) - 5);

              SELECT id INTO v_ver_id FROM public.product_versions WHERE reference_id = v_ref_id AND version_code = item.version_code;
              IF v_ver_id IS NULL THEN
                  INSERT INTO public.product_versions (reference_id, version_code, sku_base, version_attrs)
                  VALUES (v_ref_id, item.version_code, v_sku_base, COALESCE(item.version_attrs, '{}'::jsonb))
                  RETURNING id INTO v_ver_id;
                  v_created_vers := v_created_vers + 1;
              END IF;

              SELECT id INTO v_sku_id FROM public.product_skus WHERE sku_complete = item.sku_complete;
              IF v_sku_id IS NULL THEN
                  INSERT INTO public.product_skus (version_id, sku_complete, sap_description_original, color_code)
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
      $bulk$ LANGUAGE plpgsql;
    $fn$;
  END IF;

  -- Patch trigger function (if it exists) to stop writing product_type on product_references.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'sync_product_to_v6'
      AND p.prokind = 'f'
      AND oidvectortypes(p.proargtypes) = ''
  ) THEN
    EXECUTE $trg$
      CREATE OR REPLACE FUNCTION public.sync_product_to_v6()
      RETURNS trigger AS $sync$
      DECLARE
          v_ref_id uuid;
          v_ver_id uuid;
          v_color_name text;
      BEGIN
          SELECT name_color_sap INTO v_color_name FROM public.colors WHERE code_4dig = NEW.color_code;

          INSERT INTO public.product_references
              (family_code, reference_code, product_name, designation, line, commercial_measure, special_label,
               width_cm, depth_cm, height_cm, weight_kg, stacking_max, isometric_path, isometric_asset_id, status, ref_attrs)
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
      $sync$ LANGUAGE plpgsql;
    $trg$;
  END IF;

  -- Ensure bulk_import_products_v3 does not contain legacy writes to product_references.product_type.
  -- If the function already matches the repo's migration version, this is harmless.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bulk_import_products_v3'
      AND p.prokind = 'f'
  ) THEN
    EXECUTE $v3$
      CREATE OR REPLACE FUNCTION public.bulk_import_products_v3(
        p_payload jsonb,
        p_dry_run boolean DEFAULT true,
        p_test_rollback boolean DEFAULT false
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
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
        BEGIN
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
      $body$;
    $v3$;
  END IF;
END $$;
