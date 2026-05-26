-- Template <-> Dataset links (many-to-many).
-- Enables associating multiple datasets to a template and vice-versa.

CREATE TABLE IF NOT EXISTS public.template_dataset_links (
  template_id uuid NOT NULL REFERENCES public.plantillas_doc_tec(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES public.custom_datasets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_template_dataset_links_template_id
  ON public.template_dataset_links(template_id);

CREATE INDEX IF NOT EXISTS idx_template_dataset_links_dataset_id
  ON public.template_dataset_links(dataset_id);

