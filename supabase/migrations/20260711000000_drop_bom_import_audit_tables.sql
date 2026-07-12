-- The BOM screen now holds SAP analysis only for the active browser session.
-- Permanent business decisions remain in colors, references, overrides, component_items and SAP logs.
DROP TABLE IF EXISTS public.product_bom_import_findings;
DROP TABLE IF EXISTS public.product_bom_import_sku_snapshots;
DROP TABLE IF EXISTS public.product_bom_import_runs;
