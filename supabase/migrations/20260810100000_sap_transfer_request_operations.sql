-- Solicitudes de traslado SAP / Operaciones SAP.
-- Aplicada en I+D como 20260810223046_sap_transfer_request_operations el 2026-08-10.
-- Prelectura: 976 registros; huella de contenido legado d38e085c0db8eaa0c4db85185161e426.
--
-- Respaldo previo obligatorio (fuera de esta migracion, sin crear tablas nuevas):
-- 1) Exportar el resultado de:
--      SELECT * FROM public.sap_operation_logs ORDER BY created_at, id;
-- 2) Conservar junto al cambio el conteo y resumen de:
--      SELECT operation_type, success, COUNT(*)
--      FROM public.sap_operation_logs
--      GROUP BY operation_type, success
--      ORDER BY operation_type, success;
--
-- Verificacion posterior obligatoria (fuera de esta migracion):
--   SELECT operation_type, operation_status, COUNT(*)
--   FROM public.sap_operation_logs
--   GROUP BY operation_type, operation_status
--   ORDER BY operation_type, operation_status;
--
-- Reversion: restaurar el respaldo antes de eliminar columnas o indices; el CHECK
-- anterior no debe restaurarse mientras existan operation_type nuevos. Esta migracion
-- no crea tablas, funciones, triggers ni elimina registros.

ALTER TABLE public.sap_operation_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_key text,
  ADD COLUMN IF NOT EXISTS operation_status text,
  ADD COLUMN IF NOT EXISTS sap_doc_entry integer,
  ADD COLUMN IF NOT EXISTS sap_doc_num integer,
  ADD COLUMN IF NOT EXISTS operation_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_comment text,
  ADD COLUMN IF NOT EXISTS actor_email text,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS source_warehouse text,
  ADD COLUMN IF NOT EXISTS destination_warehouse text;

ALTER TABLE public.sap_operation_logs
  ALTER COLUMN item_code DROP NOT NULL;

-- Las filas historicas se conservan. "verified" significa que la operacion
-- registrada tuvo resultado exitoso; dry_run sigue distinguiendo simulaciones.
UPDATE public.sap_operation_logs
SET operation_status = CASE WHEN success THEN 'verified' ELSE 'failed' END
WHERE operation_status IS NULL;

-- Los escritores legados siguen usando success y no deben producir un estado
-- falso. Las nuevas Operaciones SAP siempre escriben su estado explicitamente;
-- una fila con estado NULL se interpreta por compatibilidad a partir de success.

ALTER TABLE public.sap_operation_logs
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_type_check,
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_status_check,
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_items_array_check,
  DROP CONSTRAINT IF EXISTS sap_operation_logs_operation_context_object_check;

-- El catalogo permitido se controla tipadamente en la aplicacion. La base deja
-- evolucionar operaciones futuras sin una migracion por cada nombre nuevo.
ALTER TABLE public.sap_operation_logs
  ADD CONSTRAINT sap_operation_logs_operation_type_check
    CHECK (operation_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  ADD CONSTRAINT sap_operation_logs_operation_status_check
    CHECK (operation_status IS NULL OR operation_status = ANY (ARRAY['pending', 'verified', 'failed', 'ambiguous'])),
  ADD CONSTRAINT sap_operation_logs_operation_items_array_check
    CHECK (jsonb_typeof(operation_items) = 'array'),
  ADD CONSTRAINT sap_operation_logs_operation_context_object_check
    CHECK (jsonb_typeof(operation_context) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS sap_operation_logs_idempotency_key_unique_idx
  ON public.sap_operation_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS sap_operation_logs_sap_document_idx
  ON public.sap_operation_logs (operation_type, sap_doc_entry, created_at DESC, id DESC)
  WHERE sap_doc_entry IS NOT NULL;

CREATE INDEX IF NOT EXISTS sap_operation_logs_operation_type_created_at_idx
  ON public.sap_operation_logs (operation_type, created_at DESC);

INSERT INTO public.app_settings (key, value, description, updated_at)
VALUES (
  'sap_transfer_request_defaults',
  jsonb_build_object(
    'cardCode', 'AC890927404-01',
    'cardName', 'FIRPLAK S A',
    'contactPerson', 10484,
    'contactPersonLabel', 'daniel.jimenez@firplak.com',
    'shipToCode', 'FIRPLAK S A',
    'shipToAddress', E'CLL 29 RO 41 15\nITAGUI\nCOLOMBIA',
    'series', 49,
    'seriesLabel', 'Producci\u00f3n',
    'priceList', -1,
    'priceListLabel', '\u00daltimo precio de compra',
    'preferredWarehouses', jsonb_build_array('MP-09', 'MP-06')
  ),
  'Valores fijos y no secretos para solicitudes de traslado SAP desde Ingenieria.',
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at;

UPDATE public.app_roles
SET allowed_modules = array_append(allowed_modules, 'module:engineering'),
    updated_at = now()
WHERE key IN ('engineering', 'admin')
  AND NOT ('module:engineering' = ANY (allowed_modules));
