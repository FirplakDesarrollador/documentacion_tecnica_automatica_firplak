-- The catalog scope is meaningful only for Core catalog templates.
-- External dataset templates keep their schema-driven contract and store NULL.
ALTER TABLE public.plantillas_doc_tec
ADD COLUMN IF NOT EXISTS catalog_scope text;

UPDATE public.plantillas_doc_tec
SET catalog_scope = CASE
    WHEN COALESCE(data_source, 'core_firplak') = 'core_firplak' THEN COALESCE(NULLIF(BTRIM(catalog_scope), ''), 'sku')
    ELSE NULL
END;

ALTER TABLE public.plantillas_doc_tec
DROP CONSTRAINT IF EXISTS plantillas_doc_tec_catalog_scope_check;

ALTER TABLE public.plantillas_doc_tec
ADD CONSTRAINT plantillas_doc_tec_catalog_scope_check
CHECK (
    (COALESCE(data_source, 'core_firplak') = 'core_firplak' AND catalog_scope IS NOT NULL AND catalog_scope IN ('family', 'reference', 'version', 'sku'))
    OR (COALESCE(data_source, 'core_firplak') <> 'core_firplak' AND catalog_scope IS NULL)
);

COMMENT ON COLUMN public.plantillas_doc_tec.catalog_scope IS
    'Catalog entity level for Core templates: family, reference, version or sku. NULL for external datasets.';
