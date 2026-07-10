-- Rename the initial route document type from furniture to cabinet.

ALTER TABLE public.product_route_documents
  ALTER COLUMN route_type SET DEFAULT 'cabinet';

ALTER TABLE public.product_route_documents
  DROP CONSTRAINT IF EXISTS product_route_documents_route_type_check;

UPDATE public.product_route_documents
SET route_type = 'cabinet'
WHERE route_type = 'furniture';

ALTER TABLE public.product_route_documents
  ADD CONSTRAINT product_route_documents_route_type_check
  CHECK (route_type = ANY (ARRAY['cabinet']));
