CREATE TABLE IF NOT EXISTS public.naming_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naming_type text NOT NULL,
  product_type text NOT NULL,
  component_key text NOT NULL,
  condition_expression text NOT NULL DEFAULT 'true',
  payload_es text,
  order_es integer,
  order_en integer,
  behavior_en text NOT NULL DEFAULT 'preserve',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_naming_components_product_type
  ON public.naming_components (product_type);

CREATE INDEX IF NOT EXISTS idx_naming_components_es_order
  ON public.naming_components (naming_type, product_type, order_es)
  WHERE order_es IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_naming_components_en_order
  ON public.naming_components (naming_type, product_type, order_en)
  WHERE order_en IS NOT NULL;

COMMENT ON TABLE public.naming_components IS
  'Unified nomenclature components for Spanish and English name construction. Phase 1 mirror of public.rules + public.naming_config_en; not yet used as runtime source of truth.';

COMMENT ON COLUMN public.naming_components.naming_type IS
  'Name flow supported by this component, e.g. final_complete_name, final_base_name, sap_description_recommended.';

COMMENT ON COLUMN public.naming_components.product_type IS
  'Product type value aligned with DISTINCT public.families.product_type values.';

COMMENT ON COLUMN public.naming_components.component_key IS
  'Stable variable/component identifier, equivalent to the current naming_config_en.variable_id when available.';

COMMENT ON COLUMN public.naming_components.payload_es IS
  'Spanish emission payload, formerly public.rules.action_payload. NULL means the component is English-only.';

COMMENT ON COLUMN public.naming_components.behavior_en IS
  'English behavior: preserve, translate, or resolved_type.';

WITH es_rule_components AS (
  SELECT
    nt.naming_type,
    COALESCE(NULLIF(r.target_value, ''), NULLIF(r.target_entity, ''), 'MUEBLE') AS product_type,
    COALESCE(
      (regexp_match(r.action_payload, '\{([A-Za-z_][A-Za-z0-9_]*)\}'))[1],
      (regexp_match(r.condition_expression, '^\s*([A-Za-z_][A-Za-z0-9_]*)'))[1],
      'component_' || r.priority::text
    ) AS component_key,
    r.condition_expression,
    r.action_payload AS payload_es,
    r.priority AS order_es
  FROM public.rules r
  CROSS JOIN (VALUES ('final_complete_name'), ('final_base_name')) AS nt(naming_type)
  WHERE r.rule_type = 'name_component'
),
es_with_en_config AS (
  SELECT
    erc.naming_type,
    erc.product_type,
    erc.component_key,
    erc.condition_expression,
    erc.payload_es,
    erc.order_es,
    enc.order_index AS order_en,
    CASE
      WHEN enc.variable_id = 'resolved_type' OR enc.behavior = 'classify_and_resolve' THEN 'resolved_type'
      WHEN enc.fallback_strategy = 'translate' OR enc.behavior = 'translate_and_emit' THEN 'translate'
      ELSE 'preserve'
    END AS behavior_en
  FROM es_rule_components erc
  LEFT JOIN public.naming_config_en enc
    ON enc.target_entity = erc.product_type
   AND enc.variable_id = erc.component_key
)
INSERT INTO public.naming_components (
  naming_type,
  product_type,
  component_key,
  condition_expression,
  payload_es,
  order_es,
  order_en,
  behavior_en
)
SELECT
  naming_type,
  product_type,
  component_key,
  condition_expression,
  payload_es,
  order_es,
  order_en,
  behavior_en
FROM es_with_en_config source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.naming_components existing
  WHERE existing.naming_type = source.naming_type
    AND existing.product_type = source.product_type
    AND existing.component_key = source.component_key
    AND existing.condition_expression IS NOT DISTINCT FROM source.condition_expression
    AND existing.payload_es IS NOT DISTINCT FROM source.payload_es
);

WITH resolved_type_components AS (
  SELECT
    nt.naming_type,
    enc.target_entity AS product_type,
    enc.variable_id AS component_key,
    'true'::text AS condition_expression,
    NULL::text AS payload_es,
    NULL::integer AS order_es,
    enc.order_index AS order_en,
    'resolved_type'::text AS behavior_en
  FROM public.naming_config_en enc
  CROSS JOIN (VALUES ('final_complete_name'), ('final_base_name')) AS nt(naming_type)
  WHERE enc.variable_id = 'resolved_type'
)
INSERT INTO public.naming_components (
  naming_type,
  product_type,
  component_key,
  condition_expression,
  payload_es,
  order_es,
  order_en,
  behavior_en
)
SELECT
  naming_type,
  product_type,
  component_key,
  condition_expression,
  payload_es,
  order_es,
  order_en,
  behavior_en
FROM resolved_type_components source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.naming_components existing
  WHERE existing.naming_type = source.naming_type
    AND existing.product_type = source.product_type
    AND existing.component_key = source.component_key
    AND existing.condition_expression IS NOT DISTINCT FROM source.condition_expression
);
