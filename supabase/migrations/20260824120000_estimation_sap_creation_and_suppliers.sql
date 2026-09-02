-- Proposal only. Review and explicitly authorize execution in Supabase I+D.
-- It adds conversion traceability, a local SAP supplier cache, and supplier links
-- without exposing either table directly to authenticated browser sessions.

ALTER TABLE public.product_design_estimations
  ADD COLUMN IF NOT EXISTS converted_to_sap boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_reference_id uuid REFERENCES public.product_references(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_version_id uuid REFERENCES public.product_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_sku_id uuid REFERENCES public.product_skus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sap_created_item_code text;

CREATE UNIQUE INDEX IF NOT EXISTS product_design_estimations_sap_created_item_code_uidx
  ON public.product_design_estimations (sap_created_item_code)
  WHERE sap_created_item_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sap_suppliers (
  bp_code text PRIMARY KEY,
  card_name text NOT NULL,
  default_currency text,
  phone_1 text,
  email_address text,
  is_active boolean NOT NULL DEFAULT true,
  sap_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sap_suppliers_bp_code_not_blank_check CHECK (NULLIF(BTRIM(bp_code), '') IS NOT NULL),
  CONSTRAINT sap_suppliers_card_name_not_blank_check CHECK (NULLIF(BTRIM(card_name), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS sap_suppliers_active_name_idx
  ON public.sap_suppliers (is_active, card_name);

ALTER TABLE public.component_items
  ADD COLUMN IF NOT EXISTS supplier_bp_code text REFERENCES public.sap_suppliers(bp_code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT component_items_supplier_config_object_check CHECK (jsonb_typeof(supplier_config) = 'object');

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS sap_item_group_code integer;

CREATE OR REPLACE FUNCTION public.set_sap_suppliers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sap_suppliers_updated_at ON public.sap_suppliers;
CREATE TRIGGER trg_sap_suppliers_updated_at
BEFORE UPDATE ON public.sap_suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_sap_suppliers_updated_at();

ALTER TABLE public.sap_suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sap_suppliers FROM anon, authenticated;
GRANT ALL ON TABLE public.sap_suppliers TO service_role;
