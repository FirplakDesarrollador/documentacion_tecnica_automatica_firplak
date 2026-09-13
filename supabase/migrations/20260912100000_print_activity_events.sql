-- Registro de actividad de impresión aceptada o fallida.
-- No representa confirmación física del papel; registra el resultado conocido
-- por el agente local o por WebUSB.
CREATE TABLE IF NOT EXISTS public.print_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL,
  transport text NOT NULL,
  copies integer NOT NULL,
  template_id uuid,
  product_id text,
  of_number text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_activity_events_status_check
    CHECK (status = ANY (ARRAY['accepted', 'failed'])),
  CONSTRAINT print_activity_events_transport_check
    CHECK (transport = ANY (ARRAY['local_agent', 'webusb'])),
  CONSTRAINT print_activity_events_copies_check
    CHECK (copies BETWEEN 1 AND 999),
  CONSTRAINT print_activity_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS print_activity_events_accepted_created_at_idx
  ON public.print_activity_events (created_at DESC)
  WHERE status = 'accepted';

ALTER TABLE public.print_activity_events ENABLE ROW LEVEL SECURITY;
