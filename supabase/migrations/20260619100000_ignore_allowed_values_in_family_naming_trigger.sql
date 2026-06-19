CREATE OR REPLACE FUNCTION public.ref_attrs_schema_without_allowed_values(p_schema jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      attr_key,
      CASE
        WHEN jsonb_typeof(attr_def) = 'object' THEN attr_def - 'allowed_values'
        ELSE attr_def
      END
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(COALESCE(p_schema, '{}'::jsonb)) AS attrs(attr_key, attr_def);
$$;

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_family()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_naming_stale_for_families(ARRAY[NEW.family_code], NULL, 'db_trigger_family');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      OLD.family_code,
      OLD.product_type,
      OLD.zone_home,
      OLD.use_destination,
      OLD.assembled_default,
      OLD.rh_default,
      public.ref_attrs_schema_without_allowed_values(OLD.ref_attrs_schema)
    ) IS DISTINCT FROM ROW(
      NEW.family_code,
      NEW.product_type,
      NEW.zone_home,
      NEW.use_destination,
      NEW.assembled_default,
      NEW.rh_default,
      public.ref_attrs_schema_without_allowed_values(NEW.ref_attrs_schema)
    ) THEN
      IF OLD.family_code IS NOT NULL AND OLD.family_code IS DISTINCT FROM NEW.family_code THEN
        PERFORM public.mark_naming_stale_for_families(ARRAY[OLD.family_code], NULL, 'db_trigger_family_old_code');
      END IF;
      PERFORM public.mark_naming_stale_for_families(ARRAY[NEW.family_code], NULL, 'db_trigger_family');
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

NOTIFY pgrst, 'reload schema';
