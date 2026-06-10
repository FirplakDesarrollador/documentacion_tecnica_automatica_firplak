-- Agregar columnas de configuracion de impresion termica a plantillas
-- print_target: 'standard_browser' (default) o 'agent_3nstar'
-- media_width_mm: ancho fisico del rollo que cruza el cabezal
-- media_length_mm: largo fisico en direccion de avance
-- media_gap_mm: separacion fisica entre etiquetas (usada en TSPL GAP)

ALTER TABLE public.plantillas_doc_tec
  ADD COLUMN IF NOT EXISTS print_target text NOT NULL DEFAULT 'standard_browser',
  ADD COLUMN IF NOT EXISTS media_width_mm numeric,
  ADD COLUMN IF NOT EXISTS media_length_mm numeric,
  ADD COLUMN IF NOT EXISTS media_gap_mm numeric NOT NULL DEFAULT 3;

-- Migrar plantillas existentes que quepan en 3nStar (ancho fisico <= 104 mm)
-- Si width_mm <= 104: asumir sin rotacion (media = dimensiones del diseno)
-- Si width_mm > 104 pero height_mm <= 104: asumir etiqueta fisica rotada
-- Si ambas dimensiones > 104: dejar standard_browser (no compatible con 3nStar)
UPDATE public.plantillas_doc_tec
SET
  print_target = 'agent_3nstar',
  media_width_mm = CASE
    WHEN width_mm <= 104 THEN width_mm
    ELSE height_mm
  END,
  media_length_mm = CASE
    WHEN width_mm <= 104 THEN height_mm
    ELSE width_mm
  END
WHERE (width_mm <= 104 OR height_mm <= 104)
  AND print_target = 'standard_browser';
