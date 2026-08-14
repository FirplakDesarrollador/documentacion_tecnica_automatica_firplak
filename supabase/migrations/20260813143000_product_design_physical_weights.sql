-- Physical-weight factors are maintained outside technical_metadata because SAP
-- component synchronization replaces that JSON payload.
ALTER TABLE public.component_items
  ADD COLUMN physical_weight_kg_per_uom numeric,
  ADD COLUMN physical_weight_source text,
  ADD COLUMN physical_weight_note text,
  ADD COLUMN physical_weight_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN physical_weight_updated_at timestamptz;

ALTER TABLE public.component_items
  ADD CONSTRAINT component_items_physical_weight_positive_check
    CHECK (physical_weight_kg_per_uom IS NULL OR physical_weight_kg_per_uom > 0),
  ADD CONSTRAINT component_items_physical_weight_source_not_blank_check
    CHECK (physical_weight_source IS NULL OR NULLIF(BTRIM(physical_weight_source), '') IS NOT NULL);

ALTER TABLE public.product_engineering_measurements
  ADD COLUMN actual_net_weight_kg numeric,
  ADD COLUMN actual_gross_weight_kg numeric;

ALTER TABLE public.product_engineering_measurements
  ADD CONSTRAINT product_engineering_measurements_actual_net_weight_positive_check
    CHECK (actual_net_weight_kg IS NULL OR actual_net_weight_kg > 0),
  ADD CONSTRAINT product_engineering_measurements_actual_gross_weight_positive_check
    CHECK (actual_gross_weight_kg IS NULL OR actual_gross_weight_kg > 0),
  ADD CONSTRAINT product_engineering_measurements_actual_gross_not_less_than_net_check
    CHECK (actual_net_weight_kg IS NULL OR actual_gross_weight_kg IS NULL OR actual_gross_weight_kg >= actual_net_weight_kg);
