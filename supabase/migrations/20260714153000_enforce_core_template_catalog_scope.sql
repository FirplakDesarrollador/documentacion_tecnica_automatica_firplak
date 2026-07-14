-- Harden the original catalog-scope constraint: a SQL CHECK accepts NULL unless it is explicit.
UPDATE public.plantillas_doc_tec
SET catalog_scope = 'sku'
WHERE COALESCE(data_source, 'core_firplak') = 'core_firplak'
  AND catalog_scope IS NULL;

ALTER TABLE public.plantillas_doc_tec
DROP CONSTRAINT IF EXISTS plantillas_doc_tec_catalog_scope_check;

ALTER TABLE public.plantillas_doc_tec
ADD CONSTRAINT plantillas_doc_tec_catalog_scope_check
CHECK (
    (COALESCE(data_source, 'core_firplak') = 'core_firplak'
        AND catalog_scope IS NOT NULL
        AND catalog_scope IN ('family', 'reference', 'version', 'sku'))
    OR (COALESCE(data_source, 'core_firplak') <> 'core_firplak' AND catalog_scope IS NULL)
);
