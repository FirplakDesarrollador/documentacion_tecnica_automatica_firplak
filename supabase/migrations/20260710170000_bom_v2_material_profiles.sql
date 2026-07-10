-- Canonical reference BOM V2: material alternatives, technical metadata and scoped overrides.

ALTER TABLE public.component_items
  ADD COLUMN IF NOT EXISTS technical_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.colors
  ADD COLUMN IF NOT EXISTS application_material_profiles_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.product_references
  ADD COLUMN IF NOT EXISTS bom_overrides jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 2,
    'operations', jsonb_build_array(),
    'color_overrides', jsonb_build_array()
  );

ALTER TABLE public.product_skus
  ADD COLUMN IF NOT EXISTS bom_overrides jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 2,
    'operations', jsonb_build_array(),
    'color_overrides', jsonb_build_array()
  );

UPDATE public.colors
SET application_colors_json = CASE
  WHEN COALESCE(application_colors_json ->> 'edge_band_full_product', '') = ''
    THEN (application_colors_json || jsonb_build_object(
      'edge_band_full_product', application_colors_json ->> 'edge_band_body'
    )) - 'edge_band_body'
  ELSE application_colors_json - 'edge_band_body'
END
WHERE color_mode IN ('full', 'equivalent')
  AND COALESCE(application_colors_json ->> 'edge_band_body', '') <> '';

ALTER TABLE public.product_references
  ALTER COLUMN product_bom_structure SET DEFAULT jsonb_build_object(
    'schema_version', 2,
    'structure_type', 'production',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  );

ALTER TABLE public.product_bom_import_runs
  ALTER COLUMN proposed_bom_structure SET DEFAULT jsonb_build_object(
    'schema_version', 2,
    'structure_type', 'production',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  );

ALTER TABLE public.component_items
  ALTER COLUMN item_bom_structure SET DEFAULT jsonb_build_object(
    'schema_version', 2,
    'structure_type', 'component',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  );

ALTER TABLE public.global_version_rules
  ALTER COLUMN bom_overrides SET DEFAULT jsonb_build_object(
    'schema_version', 2,
    'operations', jsonb_build_array(),
    'color_overrides', jsonb_build_array()
  );

ALTER TABLE public.product_versions
  ALTER COLUMN bom_overrides SET DEFAULT jsonb_build_object(
    'schema_version', 2,
    'operations', jsonb_build_array(),
    'color_overrides', jsonb_build_array()
  );

UPDATE public.product_references reference
SET product_bom_structure = jsonb_set(
  jsonb_set(reference.product_bom_structure, '{schema_version}', '2'::jsonb, true),
  '{lines}',
  COALESCE((
    SELECT jsonb_agg(
      line.value || jsonb_build_object(
        'line_kind', COALESCE(NULLIF(line.value ->> 'line_kind', ''), 'fixed'),
        'alternatives', COALESCE(line.value -> 'alternatives', '[]'::jsonb),
        'consumptions', COALESCE(line.value -> 'consumptions', '[]'::jsonb)
      )
      ORDER BY line.ordinality
    )
    FROM jsonb_array_elements(COALESCE(reference.product_bom_structure -> 'lines', '[]'::jsonb))
      WITH ORDINALITY AS line(value, ordinality)
  ), '[]'::jsonb),
  true
);

UPDATE public.component_items component
SET item_bom_structure = jsonb_set(
  jsonb_set(component.item_bom_structure, '{schema_version}', '2'::jsonb, true),
  '{lines}',
  COALESCE((
    SELECT jsonb_agg(
      line.value || jsonb_build_object(
        'line_kind', COALESCE(NULLIF(line.value ->> 'line_kind', ''), 'fixed'),
        'alternatives', COALESCE(line.value -> 'alternatives', '[]'::jsonb),
        'consumptions', COALESCE(line.value -> 'consumptions', '[]'::jsonb)
      )
      ORDER BY line.ordinality
    )
    FROM jsonb_array_elements(COALESCE(component.item_bom_structure -> 'lines', '[]'::jsonb))
      WITH ORDINALITY AS line(value, ordinality)
  ), '[]'::jsonb),
  true
);

UPDATE public.product_bom_import_runs run
SET proposed_bom_structure = jsonb_set(
      COALESCE(run.proposed_bom_structure, '{}'::jsonb),
      '{schema_version}',
      '2'::jsonb,
      true
    ),
    published_bom_structure = CASE
      WHEN run.published_bom_structure IS NULL THEN NULL
      ELSE jsonb_set(run.published_bom_structure, '{schema_version}', '2'::jsonb, true)
    END;

UPDATE public.global_version_rules
SET bom_overrides = jsonb_set(
  jsonb_set(COALESCE(bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
  '{color_overrides}',
  COALESCE(bom_overrides -> 'color_overrides', '[]'::jsonb),
  true
);

UPDATE public.product_versions
SET bom_overrides = jsonb_set(
  jsonb_set(COALESCE(bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
  '{color_overrides}',
  COALESCE(bom_overrides -> 'color_overrides', '[]'::jsonb),
  true
);

UPDATE public.product_references
SET bom_overrides = jsonb_set(
  jsonb_set(COALESCE(bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
  '{color_overrides}',
  COALESCE(bom_overrides -> 'color_overrides', '[]'::jsonb),
  true
);

UPDATE public.product_skus
SET bom_overrides = jsonb_set(
  jsonb_set(COALESCE(bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
  '{color_overrides}',
  COALESCE(bom_overrides -> 'color_overrides', '[]'::jsonb),
  true
);

ALTER TABLE public.sap_operation_logs
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_type_check;

ALTER TABLE public.sap_operation_logs
  ADD CONSTRAINT sap_operation_logs_operation_type_check
  CHECK (operation_type = ANY (ARRAY['item_status_update', 'product_tree_issue_method_update']));

CREATE OR REPLACE FUNCTION public.resolve_bom_item_code(
  p_base_item_code text,
  p_sku_color_code text,
  p_product_application_scope text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text := COALESCE(NULLIF(p_product_application_scope, ''), 'NA');
  v_variant text := '0000';
  v_candidate text;
  v_fallback text;
  v_colors jsonb := '{}'::jsonb;
  v_color_mode text := 'full';
BEGIN
  SELECT
    COALESCE(application_colors_json, '{}'::jsonb),
    COALESCE(NULLIF(color_mode, ''), 'full')
  INTO v_colors, v_color_mode
  FROM public.colors
  WHERE code_4dig = p_sku_color_code;

  IF v_color_mode IN ('full', 'equivalent') AND v_scope = 'edge_band_body' THEN
    v_scope := 'edge_band_full_product';
  END IF;

  IF v_scope NOT IN ('NA', 'na') THEN
    v_variant := COALESCE(
      NULLIF(v_colors ->> v_scope, ''),
      NULLIF(v_colors ->> 'full_product', ''),
      NULLIF(p_sku_color_code, ''),
      '0000'
    );
  END IF;

  v_candidate := p_base_item_code || '-' || v_variant;
  v_fallback := p_base_item_code || '-0000';

  IF EXISTS (SELECT 1 FROM public.component_items WHERE item_code = v_candidate) THEN
    RETURN v_candidate;
  END IF;

  IF EXISTS (SELECT 1 FROM public.component_items WHERE item_code = v_fallback) THEN
    RETURN v_fallback;
  END IF;

  RETURN v_candidate;
END;
$$;

DROP FUNCTION IF EXISTS public.resolved_bom_expanded_for_sku(text);
DROP FUNCTION IF EXISTS public.resolved_bom_for_sku(text);

CREATE FUNCTION public.resolved_bom_for_sku(p_sku_complete text)
RETURNS TABLE (
  sku_complete text,
  reference_id uuid,
  version_id uuid,
  line_id text,
  level integer,
  sort_order integer,
  base_item_code text,
  resolved_item_code text,
  resolved_item_name text,
  product_application_scope text,
  qty numeric,
  uom text,
  input_warehouse_code text,
  output_warehouse_code text,
  issue_method text,
  resolution_status text,
  alternative_id text,
  material_profile text,
  format_key text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH sku_context AS (
  SELECT
    sku.sku_complete,
    sku.color_code,
    sku.version_id,
    version.reference_id,
    COALESCE(color.color_mode, 'full') AS color_mode,
    COALESCE(color.application_colors_json, '{}'::jsonb) AS application_colors,
    COALESCE(color.application_material_profiles_json, '{}'::jsonb) AS material_profiles,
    COALESCE(reference.bom_overrides, '{"schema_version":2,"operations":[]}'::jsonb) AS reference_overrides,
    COALESCE(global_rule.bom_overrides, '{"schema_version":2,"operations":[]}'::jsonb) AS global_overrides,
    COALESCE(version.bom_overrides, '{"schema_version":2,"operations":[]}'::jsonb) AS version_overrides,
    COALESCE(sku.bom_overrides, '{"schema_version":2,"operations":[]}'::jsonb) AS sku_overrides,
    reference.product_bom_structure
  FROM public.product_skus sku
  JOIN public.product_versions version ON version.id = sku.version_id
  JOIN public.product_references reference ON reference.id = version.reference_id
  LEFT JOIN public.global_version_rules global_rule ON global_rule.version_code = version.version_code
  LEFT JOIN public.colors color ON color.code_4dig = sku.color_code
  WHERE sku.sku_complete = p_sku_complete
  LIMIT 1
),
ops AS (
  SELECT operation.value AS op, operation.ordinality AS op_order
  FROM sku_context
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(sku_context.reference_overrides -> 'operations', '[]'::jsonb)
    || COALESCE(sku_context.global_overrides -> 'operations', '[]'::jsonb)
    || COALESCE(sku_context.version_overrides -> 'operations', '[]'::jsonb)
    || COALESCE(sku_context.sku_overrides -> 'operations', '[]'::jsonb)
  ) WITH ORDINALITY AS operation(value, ordinality)
),
color_rules AS (
  SELECT override.value AS rule, override.ordinality AS rule_order
  FROM sku_context
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(sku_context.reference_overrides -> 'color_overrides', '[]'::jsonb)
    || COALESCE(sku_context.global_overrides -> 'color_overrides', '[]'::jsonb)
    || COALESCE(sku_context.version_overrides -> 'color_overrides', '[]'::jsonb)
    || COALESCE(sku_context.sku_overrides -> 'color_overrides', '[]'::jsonb)
  ) WITH ORDINALITY AS override(value, ordinality)
),
base_lines AS (
  SELECT line.value AS line, line.ordinality::integer AS fallback_order
  FROM sku_context
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(sku_context.product_bom_structure -> 'lines', '[]'::jsonb)
  ) WITH ORDINALITY AS line(value, ordinality)
),
effective_base_lines AS (
  SELECT
    COALESCE((
      SELECT base_lines.line || COALESCE(replacement.op -> 'new_line', '{}'::jsonb)
      FROM ops replacement
      WHERE replacement.op ->> 'operation_type' = 'replace_line'
        AND (
          replacement.op ->> 'target_line_id' = base_lines.line ->> 'line_id'
          OR (
            replacement.op ->> 'target_base_item_code' = base_lines.line ->> 'base_item_code'
            AND COALESCE(replacement.op ->> 'target_product_application_scope', 'NA')
              = COALESCE(base_lines.line ->> 'product_application_scope', 'NA')
          )
        )
      ORDER BY replacement.op_order DESC
      LIMIT 1
    ), base_lines.line) AS line,
    base_lines.fallback_order
  FROM base_lines
  WHERE NOT EXISTS (
    SELECT 1
    FROM ops removal
    WHERE removal.op ->> 'operation_type' = 'remove_line'
      AND (
        removal.op ->> 'target_line_id' = base_lines.line ->> 'line_id'
        OR (
          removal.op ->> 'target_base_item_code' = base_lines.line ->> 'base_item_code'
          AND COALESCE(removal.op ->> 'target_product_application_scope', 'NA')
            = COALESCE(base_lines.line ->> 'product_application_scope', 'NA')
        )
      )
  )
),
added_lines AS (
  SELECT
    addition.op -> 'new_line' AS line,
    (100000 + addition.op_order)::integer AS fallback_order
  FROM ops addition
  WHERE addition.op ->> 'operation_type' = 'add_line'
    AND jsonb_typeof(addition.op -> 'new_line') = 'object'
),
effective_lines AS (
  SELECT * FROM effective_base_lines
  UNION ALL
  SELECT * FROM added_lines
),
fixed_uses AS (
  SELECT
    effective_lines.line,
    effective_lines.fallback_order,
    COALESCE(effective_lines.line ->> 'line_id', 'ln_' || effective_lines.fallback_order::text) AS logical_line_id,
    COALESCE(effective_lines.line ->> 'base_item_code', '') AS base_item_code,
    COALESCE(effective_lines.line ->> 'product_application_scope', 'NA') AS application_scope,
    NULL::text AS alternative_id,
    NULL::text AS material_profile,
    NULL::text AS configured_profile,
    COALESCE(NULLIF(effective_lines.line ->> 'qty', '')::numeric, 0) AS fixed_qty
  FROM effective_lines
  WHERE COALESCE(effective_lines.line ->> 'line_kind', 'fixed') = 'fixed'
),
material_scopes AS (
  SELECT
    effective_lines.line,
    effective_lines.fallback_order,
    COALESCE(effective_lines.line ->> 'line_id', 'ln_' || effective_lines.fallback_order::text) AS logical_line_id,
    scope.value AS application_scope,
    NULLIF(
      COALESCE(
        NULLIF(color_rule.rule ->> 'material_profile', ''),
        sku_context.material_profiles ->> scope.value,
        sku_context.material_profiles ->> 'full_product'
      ),
      ''
    ) AS configured_profile
  FROM effective_lines
  CROSS JOIN sku_context
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE sku_context.color_mode
      WHEN 'dual' THEN '["structure","front"]'::jsonb
      WHEN 'balance' THEN '["structure","front","inner_structure"]'::jsonb
      ELSE '["full_product"]'::jsonb
    END
  ) AS scope(value)
  LEFT JOIN LATERAL (
    SELECT color_rules.rule
    FROM color_rules
    WHERE color_rules.rule ->> 'color_code' = sku_context.color_code
      AND color_rules.rule ->> 'product_application_scope' = scope.value
      AND COALESCE(color_rules.rule ->> 'base_item_code', '') = ''
    ORDER BY color_rules.rule_order DESC
    LIMIT 1
  ) color_rule ON true
  WHERE effective_lines.line ->> 'line_kind' = 'material_group'
),
material_uses AS (
  SELECT
    material_scopes.line,
    material_scopes.fallback_order,
    material_scopes.logical_line_id,
    COALESCE(alternative.value ->> 'base_item_code', '') AS base_item_code,
    material_scopes.application_scope,
    alternative.value ->> 'alternative_id' AS alternative_id,
    alternative.value ->> 'material_profile' AS material_profile,
    material_scopes.configured_profile,
    NULL::numeric AS fixed_qty
  FROM material_scopes
  LEFT JOIN LATERAL (
    SELECT alternative.value
    FROM jsonb_array_elements(COALESCE(material_scopes.line -> 'alternatives', '[]'::jsonb)) AS alternative(value)
    WHERE (
      material_scopes.configured_profile IS NOT NULL
      AND alternative.value ->> 'material_profile' = material_scopes.configured_profile
    ) OR (
      material_scopes.configured_profile IS NULL
      AND COALESCE((alternative.value ->> 'is_default')::boolean, false)
    )
    ORDER BY COALESCE((alternative.value ->> 'is_default')::boolean, false) DESC
    LIMIT 1
  ) alternative ON true
),
line_uses AS (
  SELECT * FROM fixed_uses
  UNION ALL
  SELECT * FROM material_uses
),
colored_uses AS (
  SELECT
    line_uses.*,
    sku_context.*,
    CASE
      WHEN line_uses.application_scope IN ('NA', 'na') THEN '0000'
      ELSE COALESCE(
        NULLIF(color_rule.rule ->> 'target_color_code', ''),
        NULLIF(sku_context.application_colors ->> (
          CASE
            WHEN sku_context.color_mode IN ('full', 'equivalent')
              AND line_uses.application_scope = 'edge_band_body'
              THEN 'edge_band_full_product'
            ELSE line_uses.application_scope
          END
        ), ''),
        NULLIF(sku_context.application_colors ->> 'full_product', ''),
        NULLIF(sku_context.color_code, ''),
        '0000'
      )
    END AS resolved_variant
  FROM line_uses
  CROSS JOIN sku_context
  LEFT JOIN LATERAL (
    SELECT color_rules.rule
    FROM color_rules
    WHERE color_rules.rule ->> 'color_code' = sku_context.color_code
      AND color_rules.rule ->> 'product_application_scope' = line_uses.application_scope
      AND (
        COALESCE(color_rules.rule ->> 'base_item_code', '') = ''
        OR color_rules.rule ->> 'base_item_code' = line_uses.base_item_code
      )
    ORDER BY
      (COALESCE(color_rules.rule ->> 'base_item_code', '') = line_uses.base_item_code) DESC,
      color_rules.rule_order DESC
    LIMIT 1
  ) color_rule ON true
),
component_candidates AS (
  SELECT
    colored_uses.*,
    candidate.item_code AS candidate_item_code,
    fallback.item_code AS fallback_item_code,
    COALESCE(candidate.technical_metadata, fallback.technical_metadata, '{}'::jsonb) AS technical_metadata
  FROM colored_uses
  LEFT JOIN public.component_items candidate
    ON candidate.item_code = colored_uses.base_item_code || '-' || colored_uses.resolved_variant
  LEFT JOIN public.component_items fallback
    ON fallback.item_code = colored_uses.base_item_code || '-0000'
),
resolved_uses AS (
  SELECT
    component_candidates.*,
    consumption.value AS consumption,
    COALESCE(component_candidates.candidate_item_code, component_candidates.fallback_item_code,
      component_candidates.base_item_code || '-' || component_candidates.resolved_variant) AS resolved_item_code
  FROM component_candidates
  LEFT JOIN LATERAL (
    SELECT consumption.value
    FROM jsonb_array_elements(COALESCE(component_candidates.line -> 'consumptions', '[]'::jsonb)) AS consumption(value)
    WHERE component_candidates.line ->> 'line_kind' = 'material_group'
      AND consumption.value ->> 'color_mode' = CASE
        WHEN component_candidates.color_mode = 'equivalent' THEN 'full'
        ELSE component_candidates.color_mode
      END
      AND consumption.value ->> 'product_application_scope' = component_candidates.application_scope
      AND consumption.value ->> 'material_profile' = component_candidates.material_profile
      AND (
        NULLIF(consumption.value ->> 'format_key', '') = NULLIF(component_candidates.technical_metadata ->> 'format_key', '')
        OR NULLIF(consumption.value ->> 'format_key', '') IS NULL
      )
    ORDER BY
      (NULLIF(consumption.value ->> 'format_key', '') = NULLIF(component_candidates.technical_metadata ->> 'format_key', '')) DESC,
      CASE consumption.value ->> 'status' WHEN 'confirmed' THEN 0 WHEN 'observed' THEN 1 ELSE 2 END
    LIMIT 1
  ) consumption ON true
)
SELECT
  resolved_uses.sku_complete,
  resolved_uses.reference_id,
  resolved_uses.version_id,
  CASE
    WHEN resolved_uses.line ->> 'line_kind' = 'material_group'
      THEN resolved_uses.logical_line_id || ':' || resolved_uses.application_scope
    ELSE resolved_uses.logical_line_id
  END AS line_id,
  1 AS level,
  COALESCE(NULLIF(resolved_uses.line ->> 'sort_order', '')::integer, resolved_uses.fallback_order) AS sort_order,
  resolved_uses.base_item_code,
  resolved_uses.resolved_item_code,
  component.item_name AS resolved_item_name,
  resolved_uses.application_scope AS product_application_scope,
  CASE
    WHEN resolved_uses.line ->> 'line_kind' = 'material_group'
      THEN NULLIF(resolved_uses.consumption ->> 'qty', '')::numeric
    ELSE resolved_uses.fixed_qty
  END AS qty,
  component.uom,
  COALESCE(resolved_uses.line ->> 'input_warehouse_code', resolved_uses.product_bom_structure ->> 'input_warehouse_code') AS input_warehouse_code,
  resolved_uses.product_bom_structure ->> 'output_warehouse_code' AS output_warehouse_code,
  COALESCE(NULLIF(resolved_uses.line ->> 'issue_method_override', ''), component.default_issue_method) AS issue_method,
  CASE
    WHEN resolved_uses.line ->> 'line_kind' = 'material_group'
      AND (resolved_uses.configured_profile IS NULL OR resolved_uses.alternative_id IS NULL)
      THEN 'missing_material_profile'
    WHEN resolved_uses.line ->> 'line_kind' = 'material_group'
      AND (
        resolved_uses.consumption IS NULL
        OR NULLIF(resolved_uses.consumption ->> 'qty', '') IS NULL
        OR resolved_uses.consumption ->> 'status' = 'needs_definition'
      )
      THEN 'missing_consumption'
    WHEN component.item_code IS NULL THEN 'missing_component_item'
    ELSE 'resolved'
  END AS resolution_status,
  resolved_uses.alternative_id,
  resolved_uses.material_profile,
  NULLIF(resolved_uses.technical_metadata ->> 'format_key', '') AS format_key
FROM resolved_uses
LEFT JOIN public.component_items component ON component.item_code = resolved_uses.resolved_item_code
ORDER BY sort_order, line_id;
$$;

CREATE FUNCTION public.resolved_bom_expanded_for_sku(p_sku_complete text)
RETURNS TABLE (
  sku_complete text,
  reference_id uuid,
  version_id uuid,
  line_id text,
  parent_line_id text,
  root_line_id text,
  level integer,
  sort_order integer,
  sort_path text,
  base_item_code text,
  resolved_item_code text,
  resolved_item_name text,
  product_application_scope text,
  qty numeric,
  effective_qty numeric,
  uom text,
  input_warehouse_code text,
  output_warehouse_code text,
  issue_method text,
  resolution_status text,
  is_cycle boolean
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH RECURSIVE sku_context AS (
  SELECT color_code
  FROM public.product_skus
  WHERE sku_complete = p_sku_complete
  LIMIT 1
),
tree AS (
  SELECT
    direct.sku_complete,
    direct.reference_id,
    direct.version_id,
    direct.line_id,
    NULL::text AS parent_line_id,
    direct.line_id AS root_line_id,
    1::integer AS level,
    direct.sort_order,
    lpad(direct.sort_order::text, 6, '0') AS sort_path,
    direct.base_item_code,
    direct.resolved_item_code,
    direct.resolved_item_name,
    direct.product_application_scope,
    direct.qty,
    direct.qty AS effective_qty,
    direct.uom,
    direct.input_warehouse_code,
    direct.output_warehouse_code,
    direct.issue_method,
    direct.resolution_status,
    false AS is_cycle,
    ARRAY[direct.resolved_item_code]::text[] AS item_path
  FROM public.resolved_bom_for_sku(p_sku_complete) direct

  UNION ALL

  SELECT
    parent.sku_complete,
    parent.reference_id,
    parent.version_id,
    parent.line_id || '/' || COALESCE(NULLIF(child.line ->> 'line_id', ''), 'ln_' || child.ordinality::text),
    parent.line_id,
    parent.root_line_id,
    parent.level + 1,
    COALESCE(NULLIF(child.line ->> 'sort_order', '')::integer, child.ordinality::integer),
    parent.sort_path || '.' || lpad(COALESCE(NULLIF(child.line ->> 'sort_order', ''), child.ordinality::text), 6, '0'),
    child.line ->> 'base_item_code',
    public.resolve_bom_item_code(
      child.line ->> 'base_item_code',
      sku_context.color_code,
      COALESCE(child.line ->> 'product_application_scope', 'NA')
    ),
    child_item.item_name,
    COALESCE(child.line ->> 'product_application_scope', 'NA'),
    COALESCE(NULLIF(child.line ->> 'qty', '')::numeric, 0),
    parent.effective_qty * COALESCE(NULLIF(child.line ->> 'qty', '')::numeric, 0),
    child_item.uom,
    COALESCE(NULLIF(child.line ->> 'input_warehouse_code', ''), parent.input_warehouse_code),
    parent.output_warehouse_code,
    COALESCE(NULLIF(child.line ->> 'issue_method_override', ''), child_item.default_issue_method),
    CASE
      WHEN public.resolve_bom_item_code(
        child.line ->> 'base_item_code',
        sku_context.color_code,
        COALESCE(child.line ->> 'product_application_scope', 'NA')
      ) = ANY(parent.item_path) THEN 'override_conflict'
      WHEN child_item.item_code IS NULL THEN 'missing_component_item'
      ELSE 'resolved'
    END,
    public.resolve_bom_item_code(
      child.line ->> 'base_item_code',
      sku_context.color_code,
      COALESCE(child.line ->> 'product_application_scope', 'NA')
    ) = ANY(parent.item_path),
    parent.item_path || public.resolve_bom_item_code(
      child.line ->> 'base_item_code',
      sku_context.color_code,
      COALESCE(child.line ->> 'product_application_scope', 'NA')
    )
  FROM tree parent
  CROSS JOIN sku_context
  JOIN public.component_items parent_item ON parent_item.item_code = parent.resolved_item_code
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(parent_item.item_bom_structure -> 'lines', '[]'::jsonb)
  ) WITH ORDINALITY AS child(line, ordinality)
  LEFT JOIN public.component_items child_item ON child_item.item_code = public.resolve_bom_item_code(
    child.line ->> 'base_item_code',
    sku_context.color_code,
    COALESCE(child.line ->> 'product_application_scope', 'NA')
  )
  WHERE parent.level < 12
    AND NOT parent.is_cycle
    AND COALESCE(child.line ->> 'line_kind', 'fixed') = 'fixed'
)
SELECT
  tree.sku_complete,
  tree.reference_id,
  tree.version_id,
  tree.line_id,
  tree.parent_line_id,
  tree.root_line_id,
  tree.level,
  tree.sort_order,
  tree.sort_path,
  tree.base_item_code,
  tree.resolved_item_code,
  tree.resolved_item_name,
  tree.product_application_scope,
  tree.qty,
  tree.effective_qty,
  tree.uom,
  tree.input_warehouse_code,
  tree.output_warehouse_code,
  tree.issue_method,
  tree.resolution_status,
  tree.is_cycle
FROM tree
ORDER BY sort_path, line_id;
$$;
