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
      OLD.ref_attrs_schema
    ) IS DISTINCT FROM ROW(
      NEW.family_code,
      NEW.product_type,
      NEW.zone_home,
      NEW.use_destination,
      NEW.assembled_default,
      NEW.rh_default,
      NEW.ref_attrs_schema
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

DROP TRIGGER IF EXISTS mark_naming_stale_from_family ON public.families;
CREATE TRIGGER mark_naming_stale_from_family
AFTER INSERT OR UPDATE OF family_code, product_type, zone_home, use_destination, assembled_default, rh_default, ref_attrs_schema
ON public.families
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_family();

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_naming_stale_for_references(ARRAY[NEW.id], NULL, 'db_trigger_reference');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      OLD.family_code,
      OLD.reference_code,
      OLD.product_name,
      OLD.designation,
      OLD.line,
      OLD.commercial_measure,
      OLD.width_cm,
      OLD.depth_cm,
      OLD.height_cm,
      OLD.weight_kg,
      OLD.special_label,
      OLD.stacking_max,
      OLD.ref_attrs
    ) IS DISTINCT FROM ROW(
      NEW.family_code,
      NEW.reference_code,
      NEW.product_name,
      NEW.designation,
      NEW.line,
      NEW.commercial_measure,
      NEW.width_cm,
      NEW.depth_cm,
      NEW.height_cm,
      NEW.weight_kg,
      NEW.special_label,
      NEW.stacking_max,
      NEW.ref_attrs
    ) THEN
      PERFORM public.mark_naming_stale_for_references(ARRAY[NEW.id], NULL, 'db_trigger_reference');
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_naming_stale_from_reference ON public.product_references;
CREATE TRIGGER mark_naming_stale_from_reference
AFTER INSERT OR UPDATE OF family_code, reference_code, product_name, designation, line, commercial_measure, width_cm, depth_cm, height_cm, weight_kg, special_label, stacking_max, ref_attrs
ON public.product_references
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_reference();

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_naming_stale_for_versions(ARRAY[NEW.id], NULL, 'db_trigger_version');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      OLD.reference_id,
      OLD.version_code,
      OLD.sku_base,
      OLD.version_label,
      OLD.version_attrs
    ) IS DISTINCT FROM ROW(
      NEW.reference_id,
      NEW.version_code,
      NEW.sku_base,
      NEW.version_label,
      NEW.version_attrs
    ) THEN
      PERFORM public.mark_naming_stale_for_versions(ARRAY[NEW.id], NULL, 'db_trigger_version');
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_naming_stale_from_version ON public.product_versions;
CREATE TRIGGER mark_naming_stale_from_version
AFTER INSERT OR UPDATE OF reference_id, version_code, sku_base, version_label, version_attrs
ON public.product_versions
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_version();

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_naming_stale_for_skus(ARRAY[NEW.id], NULL, 'db_trigger_sku');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      OLD.version_id,
      OLD.sku_complete,
      OLD.barcode_text,
      OLD.color_code,
      OLD.sku_attrs
    ) IS DISTINCT FROM ROW(
      NEW.version_id,
      NEW.sku_complete,
      NEW.barcode_text,
      NEW.color_code,
      NEW.sku_attrs
    ) THEN
      PERFORM public.mark_naming_stale_for_skus(ARRAY[NEW.id], NULL, 'db_trigger_sku');
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_naming_stale_from_sku ON public.product_skus;
CREATE TRIGGER mark_naming_stale_from_sku
AFTER INSERT OR UPDATE OF version_id, sku_complete, barcode_text, color_code, sku_attrs
ON public.product_skus
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_sku();

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_color()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_naming_stale_for_color(NEW.code_4dig, NULL, 'db_trigger_color');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.code_4dig, OLD.code_short, OLD.name_color_sap)
       IS DISTINCT FROM ROW(NEW.code_4dig, NEW.code_short, NEW.name_color_sap) THEN
      IF OLD.code_4dig IS NOT NULL AND OLD.code_4dig IS DISTINCT FROM NEW.code_4dig THEN
        PERFORM public.mark_naming_stale_for_color(OLD.code_4dig, NULL, 'db_trigger_color_old_code');
      END IF;
      PERFORM public.mark_naming_stale_for_color(NEW.code_4dig, NULL, 'db_trigger_color');
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_naming_stale_from_color ON public.colors;
CREATE TRIGGER mark_naming_stale_from_color
AFTER INSERT OR UPDATE OF code_4dig, code_short, name_color_sap
ON public.colors
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_color();

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_global_version_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_naming_stale_for_version_rule(NEW.version_code, NULL, 'db_trigger_global_version_rule');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.version_code, OLD.product_types, OLD.status, OLD.automatic_version_rules)
       IS DISTINCT FROM ROW(NEW.version_code, NEW.product_types, NEW.status, NEW.automatic_version_rules) THEN
      IF OLD.version_code IS NOT NULL AND OLD.version_code IS DISTINCT FROM NEW.version_code THEN
        PERFORM public.mark_naming_stale_for_version_rule(OLD.version_code, NULL, 'db_trigger_global_version_rule_old_code');
      END IF;
      PERFORM public.mark_naming_stale_for_version_rule(NEW.version_code, NULL, 'db_trigger_global_version_rule');
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_naming_stale_from_global_version_rule ON public.global_version_rules;
CREATE TRIGGER mark_naming_stale_from_global_version_rule
AFTER INSERT OR UPDATE OF version_code, product_types, status, automatic_version_rules
ON public.global_version_rules
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_global_version_rule();

CREATE OR REPLACE FUNCTION public.trg_mark_naming_stale_from_naming_component()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_product_type text;
  v_old_naming_type text;
  v_new_product_type text;
  v_new_naming_type text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_product_type := NULLIF(upper(btrim(COALESCE(OLD.product_type, ''))), '');
    v_old_naming_type := NULLIF(btrim(COALESCE(OLD.naming_type, '')), '');
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_product_type := NULLIF(upper(btrim(COALESCE(NEW.product_type, ''))), '');
    v_new_naming_type := NULLIF(btrim(COALESCE(NEW.naming_type, '')), '');
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND v_old_product_type IS NOT NULL THEN
    PERFORM public.mark_naming_stale_for_product_type(v_old_product_type, v_old_naming_type, 'db_trigger_naming_component');
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND v_new_product_type IS NOT NULL
     AND (v_old_product_type IS DISTINCT FROM v_new_product_type OR v_old_naming_type IS DISTINCT FROM v_new_naming_type OR TG_OP = 'INSERT') THEN
    PERFORM public.mark_naming_stale_for_product_type(v_new_product_type, v_new_naming_type, 'db_trigger_naming_component');
  ELSIF TG_OP = 'UPDATE' AND v_new_product_type IS NOT NULL THEN
    PERFORM public.mark_naming_stale_for_product_type(v_new_product_type, v_new_naming_type, 'db_trigger_naming_component');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_naming_stale_from_naming_component ON public.naming_components;
CREATE TRIGGER mark_naming_stale_from_naming_component
AFTER INSERT OR UPDATE OR DELETE
ON public.naming_components
FOR EACH ROW
EXECUTE FUNCTION public.trg_mark_naming_stale_from_naming_component();

NOTIFY pgrst, 'reload schema';
