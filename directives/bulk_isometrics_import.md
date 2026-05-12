# SOP: Importación masiva de isométricos por nombre (Supabase)

## Objetivo
Asociar isométricos (archivos en carpeta local) con registros de `public.product_references` en Supabase, haciendo **match por descripción**:

- `designation` (designación)
- `product_name` (nombre)
- `commercial_measure` (medida comercial)
- `ref_attrs->>'accessory_text'` (accesorio)

Cuando hay match único, el flujo:
1) Sube el archivo a Supabase Storage (bucket `assets`, path `assets/isometrics/<sha256>.<ext>` para deduplicar).
2) Crea registro en `public.assets` con `type='isometric'`.
3) Actualiza `public.product_references.isometric_asset_id / isometric_path`.

Campos usados para matching (normalizados: mayúsculas, sin acentos, sin signos):
- Base: `designation` + `product_name` + `commercial_measure`
- Opcionales si aparecen: `line` (CLASS/LIFE/ESSENTIAL/PRO) y `special_label` (ej: PUERTA SHAKER)
- Accesorio: `ref_attrs->>'accessory_text'` (mapea “con manija(s)” -> `CON MANIJAS`, “sin manija(s)” -> `NA`)

## Entradas
- Carpeta local con isométricos (PDF/PNG/JPG/JPEG/SVG).
- Nombres de archivos con partes separadas por `|` o ` - `.

Formato recomendado (tolerante a espacios):
`DESIGNATION | PRODUCT_NAME | COMMERCIAL_MEASURE | ACCESSORY_TEXT`

También soporta nombres “en frase”, por ejemplo:
- `Mueble a piso Básico LVM 94x48 con manija`
- `Mueble elevado Calder LVM 48X43 sin manijas`

Reglas de archivos:
- Los `.ai` se ignoran siempre.
- Archivos sin extensión se tratan como `.svg` (como en tu ejemplo de Windows donde “no se ve” la extensión).

## Ejecución (Dry-run primero)
Desde la raíz del repo:

- Dry-run (solo reporte, sin subir ni tocar BD):
  - `npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_isometrics.ts --source "C:\...\Isometricos"`

- Aplicar (sube + crea assets + actualiza referencias):
  - `npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_isometrics.ts --source "C:\...\Isometricos" --apply`

Opcionales:
- `--recursive` busca en subcarpetas.
- `--overwrite` permite reemplazar isométricos existentes (por defecto solo completa faltantes).
- `--ignore "cocina,alacena,exhibidor,COC"` ignora archivos por nombre (substrings, case-insensitive).
- `--delimiter "|"` fuerza separador si tu naming es consistente.
- `--ext ".pdf,.png"` limita extensiones.
- `--report "artifacts\mi_reporte.csv"` controla ruta del CSV.
- `--allow-ambiguous-accessory` permite asociar por (designación+nombre+medida) incluso si existen múltiples `accessory_text` en BD para ese grupo (útil cuando LIFE/CLASS comparten el mismo SVG).
- `--allow-ref-conflicts` permite continuar si 2 archivos distintos matchean a la misma referencia (por defecto se reporta como `CONFLICT_REF` y se omite hasta que elijas cuál archivo dejar).

## Salida
Un CSV en `artifacts/` con columnas:
- archivo, partes parseadas, estado de match, y acción aplicada (o la que se aplicaría).

## Edge cases
- `NO_MATCH`: el nombre no coincide con ningún registro (normalización en mayúsculas, sin acentos y sin signos).
- `NO_MATCH` (specific_accessory_not_found): cuando el archivo trae un accesorio **específico** (ej. `MANIJA NEGRA 128`, `MANIJA NEGRA 520`, `RFE ...`) pero en `product_references.ref_attrs->>'accessory_text'` no existe ese accesorio para ese mueble. En este caso **se ignora** para evitar asignaciones incorrectas.
- `SKIP_ALL_HAVE_ISO`: todas las referencias del grupo ya tienen isométrico. Este flujo **no sobreescribe**.
- `CONFLICT_REF`: al menos una referencia es “objetivo” de más de un archivo distinto; revisar qué isométrico es el correcto y eliminar/renombrar el otro antes de aplicar.
  - El reporte incluye `conflict_group_code` (A1, A2, ...) para agrupar rápidamente todos los conflictos relacionados.

### Overrides por versión (product_versions)
Si un archivo trae un accesorio **específico** y no existe a nivel de referencia, el script intenta un match alterno en `public.product_versions.version_attrs->>'accessory_text'`.
Si encuentra match, en el reporte aparece en `notes` como `target=version` y al aplicar, el update se hace en `product_versions.version_attrs` (keys: `isometric_asset_id`, `isometric_path`) para esas versiones.
Heurística actual: si hay varias versiones candidatas, se prioriza `version_code=CME` si existe.

## Dedupe / “un solo SVG”
El script sube a Storage usando una ruta basada en `sha256` del contenido (`assets/isometrics/<hash>.<ext>`), por lo que:
- Si el mismo archivo aparece varias veces, no genera subidas duplicadas.
- El mismo `asset` (mismo `file_path`) se reutiliza para asociar múltiples referencias que matcheen.
