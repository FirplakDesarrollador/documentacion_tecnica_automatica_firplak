ALTER TABLE public.colors
  ADD COLUMN IF NOT EXISTS allowed_manufacturing_processes text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS colors_allowed_product_types_gin_idx
  ON public.colors USING gin (allowed_product_types);

CREATE INDEX IF NOT EXISTS colors_allowed_manufacturing_processes_gin_idx
  ON public.colors USING gin (allowed_manufacturing_processes);
