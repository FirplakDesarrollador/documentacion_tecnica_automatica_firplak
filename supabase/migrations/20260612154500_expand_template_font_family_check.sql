UPDATE public.plantillas_doc_tec
SET template_font_family = 'mozaic_geo'
WHERE template_font_family IN ('mozaic_geo_light', 'mozaic_geo_regular', 'mozaic_geo_black');

ALTER TABLE public.plantillas_doc_tec
DROP CONSTRAINT IF EXISTS plantillas_doc_tec_template_font_family_check;

ALTER TABLE public.plantillas_doc_tec
ADD CONSTRAINT plantillas_doc_tec_template_font_family_check
CHECK (
    template_font_family IN (
        'montserrat',
        'lato',
        'open_sans',
        'roboto',
        'poppins',
        'orborn',
        'mozaic_geo'
    )
);
