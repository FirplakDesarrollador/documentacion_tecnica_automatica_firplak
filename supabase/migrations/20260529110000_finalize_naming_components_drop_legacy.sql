-- Finaliza la migración de nomenclatura hacia public.naming_components.
-- Intencionalmente NO usa CASCADE: si una vista/función aún depende de tablas legacy,
-- esta migración debe fallar para evitar borrar dependencias silenciosamente.

INSERT INTO public.naming_components (
  naming_type,
  product_type,
  component_key,
  condition_expression,
  payload_es,
  order_es,
  order_en,
  behavior_en,
  created_at,
  updated_at
)
SELECT
  'sap_description_recommended',
  src.product_type,
  src.component_key,
  src.condition_expression,
  src.payload_es,
  src.order_es,
  src.order_en,
  src.behavior_en,
  now(),
  now()
FROM public.naming_components src
WHERE src.naming_type = 'final_complete_name'
  AND NOT EXISTS (
    SELECT 1
    FROM public.naming_components existing
    WHERE existing.product_type = src.product_type
      AND existing.naming_type = 'sap_description_recommended'
  );

ALTER TABLE public.naming_components
  DROP CONSTRAINT IF EXISTS naming_components_behavior_en_check;

ALTER TABLE public.naming_components
  ADD CONSTRAINT naming_components_behavior_en_check
  CHECK (behavior_en IN ('translate', 'preserve', 'resolved_type'));

COMMENT ON TABLE public.naming_components IS
  'Unified source of truth for Spanish and English naming components. Replaces public.rules and public.naming_config_en.';

DROP TABLE IF EXISTS public.naming_config_en;
DROP TABLE IF EXISTS public.rules;
