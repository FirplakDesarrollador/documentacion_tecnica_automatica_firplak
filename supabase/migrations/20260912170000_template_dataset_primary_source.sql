-- A generic template can use several datasets, but exactly one is its authoring source.
ALTER TABLE public.template_dataset_links
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Preserve existing generic templates deterministically: their oldest linked dataset is primary.
WITH ranked_links AS (
  SELECT
    l.template_id,
    l.dataset_id,
    ROW_NUMBER() OVER (
      PARTITION BY l.template_id
      ORDER BY l.created_at ASC, l.dataset_id ASC
    ) AS link_position
  FROM public.template_dataset_links l
  JOIN public.plantillas_doc_tec t ON t.id = l.template_id
  WHERE t.data_source = 'custom_datasets'
)
UPDATE public.template_dataset_links l
SET is_primary = (ranked_links.link_position = 1)
FROM ranked_links
WHERE l.template_id = ranked_links.template_id
  AND l.dataset_id = ranked_links.dataset_id;

CREATE UNIQUE INDEX IF NOT EXISTS template_dataset_links_one_primary_per_template
  ON public.template_dataset_links (template_id)
  WHERE is_primary;
