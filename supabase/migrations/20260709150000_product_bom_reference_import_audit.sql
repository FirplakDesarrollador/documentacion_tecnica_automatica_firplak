-- Reference-level BOM import audit and recursive component resolution.

CREATE TABLE IF NOT EXISTS public.product_bom_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES public.product_references(id) ON DELETE CASCADE,
  analyzed_version_code text NOT NULL DEFAULT '000',
  status text NOT NULL DEFAULT 'draft',
  source_sku_count integer NOT NULL DEFAULT 0,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_bom_structure jsonb NOT NULL DEFAULT jsonb_build_object(
    'schema_version', 1,
    'structure_type', 'production',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  ),
  published_bom_structure jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  published_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_bom_import_runs_status_check CHECK (
    status = ANY (ARRAY['draft', 'needs_review', 'published', 'failed'])
  ),
  CONSTRAINT product_bom_import_runs_source_sku_count_check CHECK (source_sku_count >= 0)
);

CREATE INDEX IF NOT EXISTS product_bom_import_runs_reference_created_idx
  ON public.product_bom_import_runs(reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_bom_import_runs_status_idx
  ON public.product_bom_import_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_bom_import_sku_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.product_bom_import_runs(id) ON DELETE CASCADE,
  sku_complete text NOT NULL,
  sku_color_code text,
  sap_item_name text,
  tree_type text,
  direct_bom_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'captured',
  error_message text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_bom_import_sku_snapshots_run_sku_unique UNIQUE (run_id, sku_complete),
  CONSTRAINT product_bom_import_sku_snapshots_status_check CHECK (
    status = ANY (ARRAY['captured', 'failed'])
  ),
  CONSTRAINT product_bom_import_sku_snapshots_line_count_check CHECK (line_count >= 0)
);

CREATE INDEX IF NOT EXISTS product_bom_import_sku_snapshots_sku_idx
  ON public.product_bom_import_sku_snapshots(sku_complete);

CREATE TABLE IF NOT EXISTS public.product_bom_import_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.product_bom_import_runs(id) ON DELETE CASCADE,
  finding_key text NOT NULL,
  finding_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  status text NOT NULL DEFAULT 'open',
  line_identity text,
  base_item_code text,
  occurrence integer,
  proposed_scope text,
  proposed_color_code text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_bom_import_findings_run_key_unique UNIQUE (run_id, finding_key),
  CONSTRAINT product_bom_import_findings_severity_check CHECK (
    severity = ANY (ARRAY['blocker', 'warning', 'info'])
  ),
  CONSTRAINT product_bom_import_findings_status_check CHECK (
    status = ANY (ARRAY['open', 'accepted', 'rejected', 'resolved'])
  ),
  CONSTRAINT product_bom_import_findings_occurrence_check CHECK (
    occurrence IS NULL OR occurrence > 0
  )
);

CREATE INDEX IF NOT EXISTS product_bom_import_findings_run_status_idx
  ON public.product_bom_import_findings(run_id, status, severity);

CREATE OR REPLACE FUNCTION public.set_product_bom_import_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_bom_import_runs_updated_at ON public.product_bom_import_runs;
CREATE TRIGGER trg_product_bom_import_runs_updated_at
BEFORE UPDATE ON public.product_bom_import_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_product_bom_import_updated_at();

DROP TRIGGER IF EXISTS trg_product_bom_import_findings_updated_at ON public.product_bom_import_findings;
CREATE TRIGGER trg_product_bom_import_findings_updated_at
BEFORE UPDATE ON public.product_bom_import_findings
FOR EACH ROW
EXECUTE FUNCTION public.set_product_bom_import_updated_at();

ALTER TABLE public.product_bom_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bom_import_sku_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bom_import_findings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.resolved_bom_expanded_for_sku(p_sku_complete text)
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
tree (
  sku_complete,
  reference_id,
  version_id,
  line_id,
  parent_line_id,
  root_line_id,
  level,
  sort_order,
  sort_path,
  base_item_code,
  resolved_item_code,
  resolved_item_name,
  product_application_scope,
  qty,
  effective_qty,
  uom,
  input_warehouse_code,
  output_warehouse_code,
  issue_method,
  resolution_status,
  is_cycle,
  item_path
) AS (
  SELECT
    direct.sku_complete,
    direct.reference_id,
    direct.version_id,
    direct.line_id,
    NULL::text,
    direct.line_id,
    1::integer,
    direct.sort_order,
    lpad(direct.sort_order::text, 6, '0'),
    direct.base_item_code,
    direct.resolved_item_code,
    direct.resolved_item_name,
    direct.product_application_scope,
    direct.qty,
    direct.qty,
    direct.uom,
    direct.input_warehouse_code,
    direct.output_warehouse_code,
    direct.issue_method,
    direct.resolution_status,
    false,
    ARRAY[direct.resolved_item_code]::text[]
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
    CASE
      WHEN COALESCE(child.line ->> 'sort_order', '') ~ '^-?[0-9]+$'
        THEN (child.line ->> 'sort_order')::integer
      ELSE child.ordinality::integer
    END,
    parent.sort_path || '.' || lpad(
      CASE
        WHEN COALESCE(child.line ->> 'sort_order', '') ~ '^-?[0-9]+$'
          THEN (child.line ->> 'sort_order')::integer::text
        ELSE child.ordinality::text
      END,
      6,
      '0'
    ),
    COALESCE(
      NULLIF(child.line ->> 'base_item_code', ''),
      regexp_replace(resolved_child.item_code, '-[A-Z0-9]{4}$', '')
    ),
    resolved_child.item_code,
    child_item.item_name,
    COALESCE(NULLIF(child.line ->> 'product_application_scope', ''), 'NA'),
    CASE
      WHEN COALESCE(child.line ->> 'qty', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$'
        THEN (child.line ->> 'qty')::numeric
      ELSE 0::numeric
    END,
    parent.effective_qty * CASE
      WHEN COALESCE(child.line ->> 'qty', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$'
        THEN (child.line ->> 'qty')::numeric
      ELSE 0::numeric
    END,
    child_item.uom,
    COALESCE(NULLIF(child.line ->> 'input_warehouse_code', ''), parent.input_warehouse_code),
    parent.output_warehouse_code,
    COALESCE(NULLIF(child.line ->> 'issue_method_override', ''), child_item.default_issue_method, parent.issue_method),
    CASE
      WHEN resolved_child.item_code IS NULL OR child_item.item_code IS NULL THEN 'missing_component_item'
      WHEN resolved_child.item_code = ANY(parent.item_path) THEN 'cycle_detected'
      ELSE 'resolved'
    END,
    resolved_child.item_code IS NOT NULL AND resolved_child.item_code = ANY(parent.item_path),
    parent.item_path || COALESCE(resolved_child.item_code, '__missing_' || child.ordinality::text)
  FROM tree parent
  JOIN public.component_items parent_item
    ON parent_item.item_code = parent.resolved_item_code
  CROSS JOIN sku_context
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(parent_item.item_bom_structure -> 'lines', '[]'::jsonb)
  ) WITH ORDINALITY AS child(line, ordinality)
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      NULLIF(child.line ->> 'item_code', ''),
      CASE
        WHEN NULLIF(child.line ->> 'base_item_code', '') IS NULL THEN NULL
        WHEN NULLIF(child.line ->> 'variant_code_4', '') IS NOT NULL
          THEN (child.line ->> 'base_item_code') || '-' || (child.line ->> 'variant_code_4')
        ELSE public.resolve_bom_item_code(
          child.line ->> 'base_item_code',
          sku_context.color_code,
          COALESCE(NULLIF(child.line ->> 'product_application_scope', ''), 'NA')
        )
      END
    ) AS item_code
  ) resolved_child
  LEFT JOIN public.component_items child_item
    ON child_item.item_code = resolved_child.item_code
  WHERE parent.resolution_status = 'resolved'
    AND parent.is_cycle IS FALSE
    AND parent.level < 24
)
SELECT
  sku_complete,
  reference_id,
  version_id,
  line_id,
  parent_line_id,
  root_line_id,
  level,
  sort_order,
  sort_path,
  base_item_code,
  resolved_item_code,
  resolved_item_name,
  product_application_scope,
  qty,
  effective_qty,
  uom,
  input_warehouse_code,
  output_warehouse_code,
  issue_method,
  resolution_status,
  is_cycle
FROM tree
ORDER BY sort_path, line_id;
$$;
