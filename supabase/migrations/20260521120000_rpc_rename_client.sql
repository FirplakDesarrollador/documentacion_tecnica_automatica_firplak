-- Rename a client and propagate references to its name (case-insensitive).
-- Private-label logic is derived from the *name* stored in attrs/templates; this RPC keeps those consistent.

CREATE OR REPLACE FUNCTION public.rpc_rename_client(p_client_id uuid, p_new_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_name text;
  v_old_up text;
  v_new_name text;
  v_new_up text;
  v_clients_updated int := 0;
  v_versions_updated int := 0;
  v_skus_updated int := 0;
  v_globals_updated int := 0;
  v_templates_updated int := 0;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id requerido';
  END IF;

  v_new_name := NULLIF(BTRIM(COALESCE(p_new_name, '')), '');
  IF v_new_name IS NULL THEN
    RAISE EXCEPTION 'new_name requerido';
  END IF;
  v_new_up := UPPER(v_new_name);
  IF v_new_up IN ('NA', 'N/A', 'NULL', 'NONE') THEN
    RAISE EXCEPTION 'new_name inválido (NA/NULL/NONE no permitido)';
  END IF;

  SELECT name INTO v_old_name
  FROM public.clients
  WHERE id = p_client_id
  LIMIT 1;

  IF v_old_name IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado: %', p_client_id;
  END IF;

  v_old_up := UPPER(BTRIM(v_old_name));

  -- Validate uniqueness (case-insensitive).
  IF EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE UPPER(BTRIM(c.name)) = v_new_up
      AND c.id <> p_client_id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Ya existe un cliente con el nombre: %', v_new_name;
  END IF;

  UPDATE public.clients
  SET name = v_new_up
  WHERE id = p_client_id;
  GET DIAGNOSTICS v_clients_updated = ROW_COUNT;

  -- product_versions.version_attrs.private_label_client_name
  UPDATE public.product_versions v
  SET
    version_attrs = jsonb_set(
      COALESCE(v.version_attrs, '{}'::jsonb),
      '{private_label_client_name}',
      to_jsonb(v_new_up),
      true
    ),
    updated_at = NOW()
  WHERE (v.version_attrs ? 'private_label_client_name')
    AND UPPER(BTRIM(COALESCE(v.version_attrs->>'private_label_client_name', ''))) = v_old_up;
  GET DIAGNOSTICS v_versions_updated = ROW_COUNT;

  -- product_skus.sku_attrs.private_label_client_name
  UPDATE public.product_skus s
  SET
    sku_attrs = jsonb_set(
      COALESCE(s.sku_attrs, '{}'::jsonb),
      '{private_label_client_name}',
      to_jsonb(v_new_up),
      true
    ),
    updated_at = NOW()
  WHERE (s.sku_attrs ? 'private_label_client_name')
    AND UPPER(BTRIM(COALESCE(s.sku_attrs->>'private_label_client_name', ''))) = v_old_up;
  GET DIAGNOSTICS v_skus_updated = ROW_COUNT;

  -- global_version_rules.automatic_version_rules: update both legacy and canonical keys when matched
  UPDATE public.global_version_rules g
  SET
    automatic_version_rules = CASE
      WHEN g.automatic_version_rules IS NULL OR jsonb_typeof(g.automatic_version_rules) <> 'object' THEN g.automatic_version_rules
      ELSE
        (
          CASE
            WHEN (g.automatic_version_rules ? 'private_label_client_name')
              AND UPPER(BTRIM(COALESCE(g.automatic_version_rules->>'private_label_client_name', ''))) = v_old_up
            THEN jsonb_set(
              CASE
                WHEN (g.automatic_version_rules ? 'client_name')
                  AND UPPER(BTRIM(COALESCE(g.automatic_version_rules->>'client_name', ''))) = v_old_up
                THEN jsonb_set(g.automatic_version_rules, '{client_name}', to_jsonb(v_new_up), true)
                ELSE g.automatic_version_rules
              END,
              '{private_label_client_name}',
              to_jsonb(v_new_up),
              true
            )
            ELSE
              CASE
                WHEN (g.automatic_version_rules ? 'client_name')
                  AND UPPER(BTRIM(COALESCE(g.automatic_version_rules->>'client_name', ''))) = v_old_up
                THEN jsonb_set(g.automatic_version_rules, '{client_name}', to_jsonb(v_new_up), true)
                ELSE g.automatic_version_rules
              END
          END
        )
    END
  WHERE g.automatic_version_rules IS NOT NULL
    AND (
      (g.automatic_version_rules ? 'client_name' AND UPPER(BTRIM(COALESCE(g.automatic_version_rules->>'client_name', ''))) = v_old_up)
      OR (g.automatic_version_rules ? 'private_label_client_name' AND UPPER(BTRIM(COALESCE(g.automatic_version_rules->>'private_label_client_name', ''))) = v_old_up)
    );
  GET DIAGNOSTICS v_globals_updated = ROW_COUNT;

  -- plantillas_doc_tec.private_label_client_name
  UPDATE public.plantillas_doc_tec t
  SET
    private_label_client_name = v_new_up,
    updated_at = NOW()
  WHERE t.private_label_client_name IS NOT NULL
    AND UPPER(BTRIM(t.private_label_client_name)) = v_old_up;
  GET DIAGNOSTICS v_templates_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'old_name', v_old_name,
    'new_name', v_new_up,
    'clients_updated', v_clients_updated,
    'product_versions_updated', v_versions_updated,
    'product_skus_updated', v_skus_updated,
    'global_version_rules_updated', v_globals_updated,
    'templates_updated', v_templates_updated
  );
END;
$$;
