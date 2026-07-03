-- Hardening for BOM SAP + Hojas de ruta muebles V1

ALTER TABLE public.component_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_route_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_operation_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS product_route_documents_version_id_idx
  ON public.product_route_documents(version_id)
  WHERE version_id IS NOT NULL;

ALTER FUNCTION public.set_component_items_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.set_product_route_documents_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.resolve_bom_item_code(text, text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.resolved_bom_for_sku(text)
  SET search_path = public, pg_temp;
