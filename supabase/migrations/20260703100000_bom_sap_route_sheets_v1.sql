-- BOM SAP + Hojas de ruta muebles V1

ALTER TABLE public.product_references
  ADD COLUMN IF NOT EXISTS product_bom_structure jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 1,
    'structure_type', 'production',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  );

ALTER TABLE public.global_version_rules
  ADD COLUMN IF NOT EXISTS bom_overrides jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 1,
    'operations', jsonb_build_array()
  );

ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS bom_overrides jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 1,
    'operations', jsonb_build_array()
  );

ALTER TABLE public.colors
  ADD COLUMN IF NOT EXISTS color_mode text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS application_colors_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allowed_product_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'colors_color_mode_check'
  ) THEN
    ALTER TABLE public.colors
      ADD CONSTRAINT colors_color_mode_check
      CHECK (color_mode = ANY (ARRAY['full', 'dual', 'balance', 'equivalent']));
  END IF;
END $$;

UPDATE public.colors
SET application_colors_json = jsonb_build_object('full_product', code_4dig)
WHERE application_colors_json = '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.component_items (
  item_code text PRIMARY KEY,
  base_item_code text NOT NULL,
  variant_code_4 text NOT NULL,
  item_name text NOT NULL,
  base_item_name text,
  uom text,
  component_category text NOT NULL DEFAULT 'unknown',
  default_issue_method text,
  sap_valid boolean,
  sap_frozen boolean,
  is_inventory_item boolean,
  item_bom_structure jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 1,
    'structure_type', 'component',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT component_items_base_item_code_check CHECK (base_item_code ~ '^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$'),
  CONSTRAINT component_items_variant_code_4_check CHECK (variant_code_4 ~ '^[A-Z0-9]{4}$'),
  CONSTRAINT component_items_category_check CHECK (
    component_category = ANY (ARRAY[
      'material',
      'hardware',
      'packaging',
      'process',
      'substructure',
      'child_sku',
      'unknown'
    ])
  )
);

CREATE INDEX IF NOT EXISTS component_items_base_item_code_idx
  ON public.component_items (base_item_code);

CREATE INDEX IF NOT EXISTS component_items_variant_code_4_idx
  ON public.component_items (variant_code_4);

CREATE OR REPLACE FUNCTION public.set_component_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_component_items_updated_at ON public.component_items;
CREATE TRIGGER trg_component_items_updated_at
BEFORE UPDATE ON public.component_items
FOR EACH ROW
EXECUTE FUNCTION public.set_component_items_updated_at();

CREATE TABLE IF NOT EXISTS public.product_route_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES public.product_references(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.product_versions(id) ON DELETE CASCADE,
  route_type text NOT NULL DEFAULT 'furniture',
  schema_version integer NOT NULL DEFAULT 1,
  route_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_route_documents_route_type_check CHECK (route_type = ANY (ARRAY['furniture'])),
  CONSTRAINT product_route_documents_status_check CHECK (status = ANY (ARRAY['draft', 'review', 'approved', 'archived']))
);

CREATE UNIQUE INDEX IF NOT EXISTS product_route_documents_scope_unique
  ON public.product_route_documents(reference_id, COALESCE(version_id, '00000000-0000-0000-0000-000000000000'::uuid), route_type);

CREATE OR REPLACE FUNCTION public.set_product_route_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_route_documents_updated_at ON public.product_route_documents;
CREATE TRIGGER trg_product_route_documents_updated_at
BEFORE UPDATE ON public.product_route_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_product_route_documents_updated_at();

CREATE TABLE IF NOT EXISTS public.sap_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,
  item_code text NOT NULL,
  requested_status text,
  dry_run boolean NOT NULL DEFAULT true,
  confirmation_text text,
  sap_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sap_response jsonb,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sap_operation_logs_operation_type_check CHECK (operation_type = ANY (ARRAY['item_status_update']))
);

CREATE INDEX IF NOT EXISTS sap_operation_logs_item_code_idx
  ON public.sap_operation_logs(item_code, created_at DESC);

CREATE OR REPLACE FUNCTION public.resolve_bom_item_code(
  p_base_item_code text,
  p_sku_color_code text,
  p_product_application_scope text
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_scope text := COALESCE(NULLIF(p_product_application_scope, ''), 'NA');
  v_variant text := '0000';
  v_candidate text;
  v_fallback text;
  v_colors jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(application_colors_json, '{}'::jsonb)
  INTO v_colors
  FROM public.colors
  WHERE code_4dig = p_sku_color_code;

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

CREATE OR REPLACE FUNCTION public.resolved_bom_for_sku(p_sku_complete text)
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
  resolution_status text
)
LANGUAGE sql
STABLE
AS $$
WITH scope AS (
  SELECT
    s.sku_complete,
    s.color_code,
    s.version_id,
    v.reference_id,
    v.bom_overrides AS version_overrides,
    g.bom_overrides AS global_overrides,
    r.product_bom_structure
  FROM public.product_skus s
  JOIN public.product_versions v ON v.id = s.version_id
  JOIN public.product_references r ON r.id = v.reference_id
  LEFT JOIN public.global_version_rules g ON g.version_code = v.version_code
  WHERE s.sku_complete = p_sku_complete
  LIMIT 1
),
ops AS (
  SELECT op.value AS op, op.ordinality AS op_order
  FROM scope
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(scope.global_overrides -> 'operations', '[]'::jsonb)
    || COALESCE(scope.version_overrides -> 'operations', '[]'::jsonb)
  ) WITH ORDINALITY AS op(value, ordinality)
),
base_lines AS (
  SELECT line.value AS line, line.ordinality::integer AS fallback_order
  FROM scope
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(scope.product_bom_structure -> 'lines', '[]'::jsonb)
  ) WITH ORDINALITY AS line(value, ordinality)
),
effective_base_lines AS (
  SELECT
    COALESCE((
      SELECT base_lines.line || COALESCE(replace_op.op -> 'new_line', '{}'::jsonb)
      FROM ops replace_op
      WHERE replace_op.op ->> 'operation_type' = 'replace_line'
        AND (
          replace_op.op ->> 'target_line_id' = base_lines.line ->> 'line_id'
          OR (
            replace_op.op ->> 'target_base_item_code' = base_lines.line ->> 'base_item_code'
            AND COALESCE(replace_op.op ->> 'target_product_application_scope', 'NA')
              = COALESCE(base_lines.line ->> 'product_application_scope', 'NA')
          )
        )
      ORDER BY replace_op.op_order DESC
      LIMIT 1
    ), base_lines.line) AS line,
    base_lines.fallback_order
  FROM base_lines
  WHERE NOT EXISTS (
    SELECT 1
    FROM ops remove_op
    WHERE remove_op.op ->> 'operation_type' = 'remove_line'
      AND (
        remove_op.op ->> 'target_line_id' = base_lines.line ->> 'line_id'
        OR (
          remove_op.op ->> 'target_base_item_code' = base_lines.line ->> 'base_item_code'
          AND COALESCE(remove_op.op ->> 'target_product_application_scope', 'NA')
            = COALESCE(base_lines.line ->> 'product_application_scope', 'NA')
        )
      )
  )
),
added_lines AS (
  SELECT
    add_op.op -> 'new_line' AS line,
    (100000 + add_op.op_order)::integer AS fallback_order
  FROM ops add_op
  WHERE add_op.op ->> 'operation_type' = 'add_line'
    AND jsonb_typeof(add_op.op -> 'new_line') = 'object'
),
effective_lines AS (
  SELECT * FROM effective_base_lines
  UNION ALL
  SELECT * FROM added_lines
),
resolved AS (
  SELECT
    scope.sku_complete,
    scope.reference_id,
    scope.version_id,
    effective_lines.line,
    effective_lines.fallback_order,
    public.resolve_bom_item_code(
      effective_lines.line ->> 'base_item_code',
      scope.color_code,
      COALESCE(effective_lines.line ->> 'product_application_scope', 'NA')
    ) AS resolved_item_code,
    COALESCE(effective_lines.line ->> 'input_warehouse_code', scope.product_bom_structure ->> 'input_warehouse_code') AS resolved_input_warehouse,
    scope.product_bom_structure ->> 'output_warehouse_code' AS resolved_output_warehouse
  FROM scope
  CROSS JOIN effective_lines
)
SELECT
  resolved.sku_complete,
  resolved.reference_id,
  resolved.version_id,
  resolved.line ->> 'line_id' AS line_id,
  1 AS level,
  COALESCE(NULLIF(resolved.line ->> 'sort_order', '')::integer, resolved.fallback_order) AS sort_order,
  resolved.line ->> 'base_item_code' AS base_item_code,
  resolved.resolved_item_code,
  ci.item_name AS resolved_item_name,
  COALESCE(resolved.line ->> 'product_application_scope', 'NA') AS product_application_scope,
  COALESCE(NULLIF(resolved.line ->> 'qty', '')::numeric, 0) AS qty,
  ci.uom,
  resolved.resolved_input_warehouse AS input_warehouse_code,
  resolved.resolved_output_warehouse AS output_warehouse_code,
  COALESCE(NULLIF(resolved.line ->> 'issue_method_override', ''), ci.default_issue_method) AS issue_method,
  CASE
    WHEN ci.item_code IS NULL THEN 'missing_component_item'
    ELSE 'resolved'
  END AS resolution_status
FROM resolved
LEFT JOIN public.component_items ci ON ci.item_code = resolved.resolved_item_code
ORDER BY sort_order, line_id;
$$;
