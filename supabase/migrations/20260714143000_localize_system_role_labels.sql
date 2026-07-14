-- Ajusta etiquetas visibles de los roles de sistema; no modifica roles personalizados ni permisos.
UPDATE public.app_roles
SET
  label = CASE key
    WHEN 'production' THEN 'Producción'
    WHEN 'designer' THEN 'Diseño'
    WHEN 'engineering' THEN 'Ingeniería'
    ELSE label
  END,
  description = CASE key
    WHEN 'production' THEN 'Acceso operativo a impresión y módulos productivos.'
    WHEN 'designer' THEN 'Acceso a herramientas de diseño técnico de producto.'
    WHEN 'engineering' THEN 'Rol reservado sin módulos activos por defecto.'
    ELSE description
  END,
  updated_at = now()
WHERE key IN ('production', 'designer', 'engineering');
