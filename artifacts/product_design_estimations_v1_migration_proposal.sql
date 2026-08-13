-- PROPOSAL ONLY — NOT APPLIED TO SUPABASE.
--
-- Purpose: V1 of the integrated estimator for new products.
-- Scope: creates exactly two new tables, their updated_at triggers, minimum
-- indexes/RLS, and the nine verified historical MS measurements. It does not
-- create SAP items, products, SKUs, references, BOMs, revisions, RPCs, views,
-- profiles, or bridge tables.
--
-- Execute only after explicit authorization from the product owner. Before
-- execution, export any existing rows with these names (the preflight should
-- currently return zero) and take the normal I+D schema backup.

BEGIN;

CREATE TABLE public.product_design_estimations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version integer NOT NULL DEFAULT 1,
  manufacturing_process text NOT NULL DEFAULT 'MÁRMOL SINTÉTICO',
  sap_prefix text NOT NULL,
  family_code text REFERENCES public.families(family_code) ON DELETE SET NULL,
  proposed_reference_code text,
  provisional_name text NOT NULL,
  width_mm numeric,
  depth_mm numeric,
  height_mm numeric,
  color_code text REFERENCES public.colors(code_4dig) ON DELETE SET NULL,
  homologue_sap_item_code text,
  status text NOT NULL DEFAULT 'draft',
  technical_review_status text NOT NULL DEFAULT 'not_requested',
  technical_review_note text,
  technical_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  technical_reviewed_at timestamptz,
  shared_with_sales boolean NOT NULL DEFAULT false,
  shared_with_sales_at timestamptz,
  shared_with_sales_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  commercial_outcome text NOT NULL DEFAULT 'pending',
  commercial_contact_name text,
  commercial_outcome_at timestamptz,
  commercial_recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  commercial_recorded_at timestamptz,
  commercial_note text,
  draft_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_design_estimations_schema_version_check
    CHECK (schema_version > 0),
  CONSTRAINT product_design_estimations_process_not_blank_check
    CHECK (NULLIF(BTRIM(manufacturing_process), '') IS NOT NULL),
  CONSTRAINT product_design_estimations_sap_prefix_not_blank_check
    CHECK (NULLIF(BTRIM(sap_prefix), '') IS NOT NULL),
  CONSTRAINT product_design_estimations_reference_code_check
    CHECK (proposed_reference_code IS NULL OR proposed_reference_code ~ '^[0-9]{4,}$'),
  CONSTRAINT product_design_estimations_provisional_name_not_blank_check
    CHECK (NULLIF(BTRIM(provisional_name), '') IS NOT NULL),
  CONSTRAINT product_design_estimations_width_mm_check
    CHECK (width_mm IS NULL OR width_mm > 0),
  CONSTRAINT product_design_estimations_depth_mm_check
    CHECK (depth_mm IS NULL OR depth_mm > 0),
  CONSTRAINT product_design_estimations_height_mm_check
    CHECK (height_mm IS NULL OR height_mm > 0),
  CONSTRAINT product_design_estimations_homologue_not_blank_check
    CHECK (homologue_sap_item_code IS NULL OR NULLIF(BTRIM(homologue_sap_item_code), '') IS NOT NULL),
  CONSTRAINT product_design_estimations_status_check
    CHECK (status = ANY (ARRAY['draft', 'active', 'closed', 'archived'])),
  CONSTRAINT product_design_estimations_technical_review_status_check
    CHECK (technical_review_status = ANY (ARRAY['not_requested', 'pending', 'reviewed', 'observed'])),
  CONSTRAINT product_design_estimations_commercial_outcome_check
    CHECK (commercial_outcome = ANY (ARRAY['pending', 'approved', 'rejected', 'not_pursued'])),
  CONSTRAINT product_design_estimations_shared_at_check
    CHECK (NOT shared_with_sales OR shared_with_sales_at IS NOT NULL),
  CONSTRAINT product_design_estimations_draft_data_object_check
    CHECK (jsonb_typeof(draft_data_json) = 'object')
);

CREATE TABLE public.product_engineering_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version integer NOT NULL DEFAULT 1,
  calibration_group text NOT NULL DEFAULT 'SYNTHETIC_MARBLE_GENERAL',
  measurement_status text NOT NULL DEFAULT 'pending',
  sample_label text NOT NULL,
  sap_prefix text,
  family_code text REFERENCES public.families(family_code) ON DELETE SET NULL,
  product_reference_id uuid REFERENCES public.product_references(id) ON DELETE SET NULL,
  product_version_id uuid REFERENCES public.product_versions(id) ON DELETE SET NULL,
  product_sku_id uuid REFERENCES public.product_skus(id) ON DELETE SET NULL,
  sap_item_code text,
  legacy_product_name text,
  color_code text REFERENCES public.colors(code_4dig) ON DELETE SET NULL,
  cad_volume_mm3 numeric,
  paint_area_mm2 numeric,
  mixture_kg numeric,
  gelcoat_kg numeric,
  measured_at date,
  production_lot text,
  source_type text NOT NULL DEFAULT 'manual',
  source_file text,
  source_sheet text,
  source_row integer,
  source_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_engineering_measurements_schema_version_check
    CHECK (schema_version > 0),
  CONSTRAINT product_engineering_measurements_group_not_blank_check
    CHECK (NULLIF(BTRIM(calibration_group), '') IS NOT NULL),
  CONSTRAINT product_engineering_measurements_status_check
    CHECK (measurement_status = ANY (ARRAY['pending', 'valid', 'excluded'])),
  CONSTRAINT product_engineering_measurements_label_not_blank_check
    CHECK (NULLIF(BTRIM(sample_label), '') IS NOT NULL),
  CONSTRAINT product_engineering_measurements_sap_prefix_not_blank_check
    CHECK (sap_prefix IS NULL OR NULLIF(BTRIM(sap_prefix), '') IS NOT NULL),
  CONSTRAINT product_engineering_measurements_source_type_not_blank_check
    CHECK (NULLIF(BTRIM(source_type), '') IS NOT NULL),
  CONSTRAINT product_engineering_measurements_source_file_not_blank_check
    CHECK (source_file IS NULL OR NULLIF(BTRIM(source_file), '') IS NOT NULL),
  CONSTRAINT product_engineering_measurements_source_sheet_not_blank_check
    CHECK (source_sheet IS NULL OR NULLIF(BTRIM(source_sheet), '') IS NOT NULL),
  CONSTRAINT product_engineering_measurements_source_row_check
    CHECK (source_row IS NULL OR source_row > 0),
  CONSTRAINT product_engineering_measurements_volume_check
    CHECK (cad_volume_mm3 IS NULL OR cad_volume_mm3 > 0),
  CONSTRAINT product_engineering_measurements_area_check
    CHECK (paint_area_mm2 IS NULL OR paint_area_mm2 > 0),
  CONSTRAINT product_engineering_measurements_mixture_check
    CHECK (mixture_kg IS NULL OR mixture_kg > 0),
  CONSTRAINT product_engineering_measurements_gelcoat_check
    CHECK (gelcoat_kg IS NULL OR gelcoat_kg > 0),
  CONSTRAINT product_engineering_measurements_valid_complete_check
    CHECK (
      measurement_status <> 'valid'
      OR (
        cad_volume_mm3 IS NOT NULL
        AND paint_area_mm2 IS NOT NULL
        AND mixture_kg IS NOT NULL
        AND gelcoat_kg IS NOT NULL
      )
    ),
  CONSTRAINT product_engineering_measurements_evidence_object_check
    CHECK (jsonb_typeof(source_evidence_json) = 'object')
);

CREATE INDEX product_design_estimations_status_updated_idx
  ON public.product_design_estimations (status, updated_at DESC);

CREATE INDEX product_design_estimations_sap_prefix_updated_idx
  ON public.product_design_estimations (sap_prefix, updated_at DESC);

CREATE INDEX product_design_estimations_sales_visible_updated_idx
  ON public.product_design_estimations (updated_at DESC)
  WHERE shared_with_sales IS TRUE;

CREATE UNIQUE INDEX product_engineering_measurements_source_locator_uidx
  ON public.product_engineering_measurements (source_file, source_sheet, source_row)
  WHERE source_file IS NOT NULL
    AND source_sheet IS NOT NULL
    AND source_row IS NOT NULL;

CREATE INDEX product_engineering_measurements_valid_calibration_idx
  ON public.product_engineering_measurements (calibration_group, measured_at DESC, id)
  WHERE measurement_status = 'valid';

CREATE OR REPLACE FUNCTION public.set_product_design_estimations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_engineering_measurements_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_design_estimations_updated_at
  ON public.product_design_estimations;
CREATE TRIGGER trg_product_design_estimations_updated_at
BEFORE UPDATE ON public.product_design_estimations
FOR EACH ROW
EXECUTE FUNCTION public.set_product_design_estimations_updated_at();

DROP TRIGGER IF EXISTS trg_product_engineering_measurements_updated_at
  ON public.product_engineering_measurements;
CREATE TRIGGER trg_product_engineering_measurements_updated_at
BEFORE UPDATE ON public.product_engineering_measurements
FOR EACH ROW
EXECUTE FUNCTION public.set_product_engineering_measurements_updated_at();

ALTER TABLE public.product_design_estimations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_engineering_measurements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_design_estimations FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_engineering_measurements FROM anon, authenticated;
GRANT ALL ON TABLE public.product_design_estimations TO service_role;
GRANT ALL ON TABLE public.product_engineering_measurements TO service_role;

-- Historical seed: only the nine rows marked REAL. The source locator index
-- makes this idempotent and DO NOTHING preserves any later manual enrichment.
INSERT INTO public.product_engineering_measurements (
  calibration_group,
  measurement_status,
  sample_label,
  legacy_product_name,
  cad_volume_mm3,
  mixture_kg,
  paint_area_mm2,
  gelcoat_kg,
  source_type,
  source_file,
  source_sheet,
  source_row,
  source_evidence_json
)
VALUES
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'LVM OSLO 48X38 (REAL)', 'LVM OSLO 48X38 (REAL)',
    2270000, 6.2, 355800, 0.4, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 3,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'LVM OSLO 48X38 (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B3', 'cad_volume_mm3', 'C3', 'mixture_kg', 'D3', 'paint_area_mm2', 'F3', 'gelcoat_kg', 'G3'),
      'formula_cells', jsonb_build_object('gelcoat_kg', '400/1000'),
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'LVM VESSEL DOHA (REAL)', 'LVM VESSEL DOHA (REAL)',
    1439000, 4, 257700, 0.4, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 5,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'LVM VESSEL DOHA (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B5', 'cad_volume_mm3', 'C5', 'mixture_kg', 'D5', 'paint_area_mm2', 'F5', 'gelcoat_kg', 'G5'),
      'formula_cells', jsonb_build_object('cad_volume_mm3', '1439000'),
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'Meson Oasis 63x48 (REAL)', 'Meson Oasis 63x48 (REAL)',
    1928000, 6, 279000, 0.46, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 7,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'Meson Oasis 63x48 (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B7', 'cad_volume_mm3', 'C7', 'mixture_kg', 'D7', 'paint_area_mm2', 'F7', 'gelcoat_kg', 'G7'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'Lavamanos Meca Vessel 35x35 (REAL)', 'Lavamanos Meca Vessel 35x35 (REAL)',
    1850000, 4, 238200, 0.37, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 9,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'Lavamanos Meca Vessel 35x35 (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B9', 'cad_volume_mm3', 'C9', 'mixture_kg', 'D9', 'paint_area_mm2', 'F9', 'gelcoat_kg', 'G9'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'LVR VERSA 55X50 - REAL', 'LVR VERSA 55X50 - REAL',
    3416000, 9.5, 482700, 0.6, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 16,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'LVR VERSA 55X50 - REAL',
      'cell_ranges', jsonb_build_object('label', 'B16', 'cad_volume_mm3', 'C16', 'mixture_kg', 'D16', 'paint_area_mm2', 'F16', 'gelcoat_kg', 'G16'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'Lavarropas Versa 50X50 - REAL', 'Lavarropas Versa 50X50 - REAL',
    3131000, 8, 432900, 0.42, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 17,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'Lavarropas Versa 50X50 - REAL',
      'cell_ranges', jsonb_build_object('label', 'B17', 'cad_volume_mm3', 'C17', 'mixture_kg', 'D17', 'paint_area_mm2', 'F17', 'gelcoat_kg', 'G17'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'MESON COCINA VERSA 150X55 BLANCO FORT-SIN PERF CUB-SIN PERF GRIF (REAL)', 'MESON COCINA VERSA 150X55 BLANCO FORT-SIN PERF CUB-SIN PERF GRIF (REAL)',
    6596000, 19.8, 1055000, 1.4, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 20,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'MESON COCINA VERSA 150X55 BLANCO FORT-SIN PERF CUB-SIN PERF GRIF (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B20', 'cad_volume_mm3', 'C20', 'mixture_kg', 'D20', 'paint_area_mm2', 'F20', 'gelcoat_kg', 'G20'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'MESON COCINA ECO 150X55 BLANCO FORT-SIN PERF CUB-SIN PERF GRIF (REAL)', 'MESON COCINA ECO 150X55 BLANCO FORT-SIN PERF CUB-SIN PERF GRIF (REAL)',
    9743000, 20, 1078000, 1.45, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 24,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'MESON COCINA ECO 150X55 BLANCO FORT-SIN PERF CUB-SIN PERF GRIF (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B24', 'cad_volume_mm3', 'C24', 'mixture_kg', 'D24', 'paint_area_mm2', 'F24', 'gelcoat_kg', 'G24'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  ),
  (
    'SYNTHETIC_MARBLE_GENERAL', 'valid', 'MESON COCINA ECO 150X55 BLANCO FORT-PERF CUB-SIN PERF GRIF (REAL)', 'MESON COCINA ECO 150X55 BLANCO FORT-PERF CUB-SIN PERF GRIF (REAL)',
    7468000, 23, 1053000, 1.5, 'historical_excel',
    'artifacts/Costeo inicial para Productos MS y FV.xlsx', 'Mármol Sintético', 26,
    jsonb_build_object(
      'workbook_sha256', '960790f513a48604a895743b7a23edc98b2033d67ce44e7e2f7bf92dcda8a1c1',
      'source_label', 'MESON COCINA ECO 150X55 BLANCO FORT-PERF CUB-SIN PERF GRIF (REAL)',
      'cell_ranges', jsonb_build_object('label', 'B26', 'cad_volume_mm3', 'C26', 'mixture_kg', 'D26', 'paint_area_mm2', 'F26', 'gelcoat_kg', 'G26'),
      'formula_cells', '{}'::jsonb,
      'read_mode', 'evaluated_cell_result'
    )
  )
ON CONFLICT (source_file, source_sheet, source_row)
WHERE source_file IS NOT NULL
  AND source_sheet IS NOT NULL
  AND source_row IS NOT NULL
DO NOTHING;

COMMIT;

-- Post-application verification (run separately, read-only):
-- SELECT COUNT(*) FROM public.product_engineering_measurements
-- WHERE calibration_group = 'SYNTHETIC_MARBLE_GENERAL' AND measurement_status = 'valid';
-- -- expected: 9
-- SELECT SUM(mixture_kg) / SUM(cad_volume_mm3) AS mixture_kg_per_mm3,
--        SUM(gelcoat_kg) / SUM(paint_area_mm2) AS gelcoat_kg_per_mm2
-- FROM public.product_engineering_measurements
-- WHERE calibration_group = 'SYNTHETIC_MARBLE_GENERAL' AND measurement_status = 'valid';
-- -- expected: 0.0000026558494754366955 and 0.0000013378437780708292
--
-- Reversal plan (only after export and explicit authorization): disable the
-- estimator routes, export both tables, then DROP TABLE each table and DROP
-- FUNCTION each table-specific updated_at function. Nothing in this proposal
-- cascades into the product catalog or SAP.
