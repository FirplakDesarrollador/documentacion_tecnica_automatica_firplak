-- Extiende la auditoría existente y habilita la administración de códigos SAP
-- para los roles que ya tienen acceso al diseño de producto.
-- No aplicar en remoto sin revisión y autorización explícita.

ALTER TABLE public.sap_operation_logs
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_type_check;

ALTER TABLE public.sap_operation_logs
  ADD CONSTRAINT sap_operation_logs_operation_type_check
  CHECK (operation_type ~ '^[a-z][a-z0-9_]{1,63}$');

UPDATE public.app_roles
SET allowed_modules = array_append(allowed_modules, 'action:sap-code:manage')
WHERE 'module:product-design' = ANY (allowed_modules)
  AND NOT ('action:sap-code:manage' = ANY (allowed_modules));
