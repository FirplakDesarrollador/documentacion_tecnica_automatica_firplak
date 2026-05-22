ALTER TABLE public.plantillas_doc_tec
ADD COLUMN IF NOT EXISTS template_font_family text;

UPDATE public.plantillas_doc_tec
SET template_font_family = 'montserrat'
WHERE template_font_family IS NULL
   OR NULLIF(BTRIM(template_font_family), '') IS NULL;

ALTER TABLE public.plantillas_doc_tec
ALTER COLUMN template_font_family SET DEFAULT 'montserrat';

ALTER TABLE public.plantillas_doc_tec
ALTER COLUMN template_font_family SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'plantillas_doc_tec_template_font_family_check'
    ) THEN
        ALTER TABLE public.plantillas_doc_tec
        ADD CONSTRAINT plantillas_doc_tec_template_font_family_check
        CHECK (template_font_family IN ('montserrat', 'lato', 'open_sans', 'roboto'));
    END IF;
END $$;
