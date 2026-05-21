-- Sanitize deprecated private-label keys inside product_versions.version_attrs.
-- Business rule: private-label is derived from private_label_client_name only.
-- If private_label_client_name is unset (NULL/empty/"NA"), do not persist the key.

CREATE OR REPLACE FUNCTION public.sanitize_product_version_attrs(p_attrs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    attrs jsonb := COALESCE(p_attrs, '{}'::jsonb);
    plc_raw text;
    plc_norm text;
BEGIN
    -- Remove deprecated/legacy keys that should never be stored at version level.
    attrs := attrs - 'private_label_flag' - 'private_label_client_id';

    plc_raw := attrs->>'private_label_client_name';
    plc_norm := NULLIF(btrim(COALESCE(plc_raw, '')), '');

    IF plc_norm IS NULL OR upper(plc_norm) = 'NA' THEN
        attrs := attrs - 'private_label_client_name';
        RETURN attrs;
    END IF;

    -- Canonicalize to trimmed string.
    attrs := (attrs - 'private_label_client_name') || jsonb_build_object('private_label_client_name', plc_norm);
    RETURN attrs;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sanitize_product_version_attrs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.version_attrs := public.sanitize_product_version_attrs(NEW.version_attrs);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_product_version_attrs ON public.product_versions;
CREATE TRIGGER trg_sanitize_product_version_attrs
BEFORE INSERT OR UPDATE OF version_attrs
ON public.product_versions
FOR EACH ROW
EXECUTE FUNCTION public.trg_sanitize_product_version_attrs();

-- One-time cleanup for existing rows (idempotent).
UPDATE public.product_versions
SET version_attrs = public.sanitize_product_version_attrs(version_attrs),
    updated_at = NOW()
WHERE version_attrs IS NOT NULL
  AND (
    (version_attrs ? 'private_label_flag')
    OR (version_attrs ? 'private_label_client_id')
    OR (
      (version_attrs ? 'private_label_client_name')
      AND (
        version_attrs->>'private_label_client_name' IS NULL
        OR NULLIF(btrim(COALESCE(version_attrs->>'private_label_client_name','')), '') IS NULL
        OR upper(btrim(COALESCE(version_attrs->>'private_label_client_name',''))) = 'NA'
      )
    )
  );

