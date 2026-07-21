-- Extiende la auditoría existente y habilita la administración de códigos SAP
-- para los roles que ya tienen acceso al diseño de producto.
-- No aplicar en remoto sin revisión y autorización explícita.

ALTER TABLE public.sap_operation_logs
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_type_check;

ALTER TABLE public.sap_operation_logs
  ADD CONSTRAINT sap_operation_logs_operation_type_check
  CHECK (operation_type = ANY (ARRAY[
    'item_status_update',
    'product_tree_issue_method_update',
    'reference_bom_read',
    'component_catalog_sync',
    'sap_code_creation',
    'sap_code_creation_rollback',
    'sap_code_delete_dry_run',
    'sap_code_delete_bom',
    'sap_code_delete_item',
    'sap_code_delete_blocked',
    'sap_code_delete_partial',
    'sap_code_delete'
  ]));

UPDATE public.app_roles
SET allowed_modules = array_append(allowed_modules, 'action:sap-code:manage')
WHERE 'module:product-design' = ANY (allowed_modules)
  AND NOT ('action:sap-code:manage' = ANY (allowed_modules));
