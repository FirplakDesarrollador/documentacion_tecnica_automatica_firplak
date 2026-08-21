# SOP: Importación masiva de recursos por nombre (vistas, despieces, pasos, instructivos)

## Objetivo
Asociar recursos no-isométricos (vista frontal/lateral/superior acotada, despiece/vista explotada, paso de armado, instructivo PDF) con el catálogo en Supabase, escribiendo filas en `public.product_asset_links` (tabla puente N:N). El match es **por nombre de archivo** contra los campos de `public.product_references`:

- `designation` (designación)
- `product_name` (nombre)
- `commercial_measure` (medida comercial)
- `ref_attrs->>'accessory_text'` (accesorio)
- `line` / `special_label` opcionales

Cuando hay match único, el flujo (en `--apply`):
1) Sube el archivo a Supabase Storage (bucket `assets`, path `assets/resources/<tipo>/<sha256>.<ext>` para deduplicar por contenido).
2) Crea o reutiliza el registro en `public.assets` (`type` = tipo de recurso).
3) Inserta filas en `public.product_asset_links` apuntando a la referencia y/o versiones objetivo.

Este flujo **no modifica** `product_references` ni `product_versions`; solo crea links de recurso.

## Tipos de recurso soportados
- `instruction_pdf` (instructivo de instalación / manual)
- `front_view_dimensioned` (vista frontal acotada)
- `side_view_dimensioned` (vista lateral acotada)
- `top_view_dimensioned` (vista superior acotada / planta)
- `exploded_view` (despiece / vista explotada)
- `assembly_step` (paso de armado)

## Alcance de los targets (--scope)
- `direct` (default): el archivo se vincula solo a las referencias/versiones que matchearon por nombre.
- `inherit`: cada referencia/versión matcheada se expande a TODAS las referencias/versiones que comparten el mismo isométrico
  (`product_references.isometric_asset_id` / `product_versions.version_attrs->>'isometric_asset_id'`).
  Si una referencia no tiene isométrico, queda como target directo (fallback).
- Por archivo se puede sobrescribir con `--mapping` (CSV con columnas `file,scope,type,label`; `file` = nombre base sin extensión).

## Público vs interno
- Por defecto los recursos quedan **internos** (`is_public=false`, sin `document_slot`). No aparecen como documento público con QR.
- Solo `instruction_pdf` puede tener QR público: pasar `--public-slot <slot>` (ej. `manual_instalacion`).
  El slot debe tener un prefijo activo en `public.document_slug_prefixes` (Configuración > Nomenclatura).
- `--public-label` controla el label del slug público (default: nombre base del archivo).

## Entradas
- Carpeta local con los archivos de recurso (PDF/PNG/JPG/JPEG/SVG).
- Nombres con el patrón: `DESIGNATION | PRODUCT_NAME | COMMERCIAL_MEASURE | ACCESSORY_TEXT`
  (mismo motor de parsing que el flujo de isométricos; tolera frases como `Mueble a piso Básico LVM 94x48 con manija`).
- Los sufijos de tipo se eliminan del nombre antes del match, por tipo:
  - `instruction_pdf`: INSTRUCTIVO, INSTRUCCIONES, INSTRUCCION, MANUAL, INSTALACION
  - `front_view_dimensioned`: VISTA FRONTAL ACOTADA, VISTA FRONTAL, VISTA ACOTADA FRONTAL
  - `side_view_dimensioned`: VISTA LATERAL ACOTADA, VISTA LATERAL, VISTA ACOTADA LATERAL
  - `top_view_dimensioned`: VISTA SUPERIOR ACOTADA, VISTA SUPERIOR, VISTA ACOTADA SUPERIOR, PLANTA
  - `exploded_view`: DESPIECE, VISTA EXPLOTADA, EXPLOTADA, EXPLOTADO, DESPIECE ARMADO
  - `assembly_step`: PASO DE ARMADO, ARMADO, PASO (también `PASO N`)
- Se pueden agregar sufijos extra con `--suffix-words "VISTA 3D,CROQUIS"`.
- Los `.ai` se ignoran siempre; archivos sin extensión se tratan como `.svg`.

## Ejecución (Dry-run primero)
Desde la raíz del repo:

- Dry-run (solo reporte, sin subir ni tocar BD):
  - `npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_resources.ts --source "C:\...\VistasFrontales" --type front_view_dimensioned`

- Aplicar con scope heredado del isométrico e instructivo público:
  - `npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_resources.ts --source "C:\...\Instructivos" --type instruction_pdf --scope inherit --public-slot manual_instalacion --apply`

Opcionales:
- `--recursive` busca en subcarpetas.
- `--overwrite` reemplaza links existentes del mismo tipo que apuntan a otro asset (por defecto solo completa faltantes).
- `--ignore "cocina,alacena"` ignora archivos por nombre (substrings, case-insensitive).
- `--delimiter "|"` fuerza separador si tu naming es consistente.
- `--ext ".pdf,.png"` limita extensiones.
- `--mapping "artifacts\mapping.csv"` overrides por archivo (columnas `file,scope,type,label`).
- `--allow-ambiguous-accessory` permite asociar por (designación+nombre+medida) incluso con múltiples `accessory_text` en BD.
- `--allow-ref-conflicts` permite continuar si 2 archivos distintos matchean a la misma referencia (default: `CONFLICT_REF` y se omite).
- `--fail-fast-unreadable` aborta en apply antes de escribir si algún archivo no se puede abrir.
- `--gap-report` escribe además `artifacts/resource_gaps_<tipo>_<fecha>.csv` con cada referencia activa,
  si tiene isométrico, si ya tiene el recurso, y si fue matcheada por algún archivo.
- `--report "artifacts\mi_reporte.csv"` controla ruta del CSV.

## Salida
CSV en `artifacts/` con columnas:
`file_full_path, file_base_name, resource_type, scope_mode, parsed_*, match_mode, target_granularity, matched_references, matched_versions, expanded_references, expanded_versions, target_total, existing_links, inserted_links, action, notes`

Acciones posibles: `APPLIED`, `WOULD_APPLY`, `SKIP_ALREADY_LINKED`, `SKIP_HAS_OTHER`, `NO_MATCH`, `AMBIGUOUS_ACCESSORY`, `CONFLICT_REF`, `IGNORED`, `SKIP` (parse falló), `ERROR`.

## Edge cases
- `NO_MATCH`: el nombre no coincide con ningún registro (normalización en mayúsculas, sin acentos, sin signos).
- `NO_MATCH` (specific_accessory_not_found): el archivo trae un accesorio específico que no existe en la referencia; se ignora.
  Si el accesorio sí existe a nivel de versión (`product_versions.version_attrs->>'accessory_text'`), el target baja a nivel versión (heurística: prioriza `version_code=CME`).
- `SKIP_ALREADY_LINKED`: el target ya está vinculado al mismo asset (mismo contenido) para este tipo; no duplica.
- `SKIP_HAS_OTHER`: el target ya tiene un link del mismo tipo a otro asset; usar `--overwrite` para reemplazarlo.
- `CONFLICT_REF`: al menos una referencia es objetivo de más de un archivo distinto; revisar qué archivo es el correcto antes de aplicar.
- `AMBIGUOUS_ACCESSORY`: múltiples `accessory_text` para el mismo grupo y el archivo no especifica uno; usar `--allow-ambiguous-accessory` si el recurso aplica a todos.
- `--public-slot` con tipo distinto a `instruction_pdf` es error y aborta.

## Dedupe / un solo asset
El script sube a Storage usando `sha256` del contenido (`assets/resources/<tipo>/<hash>.<ext>`):
- Si el mismo archivo aparece varias veces, no genera subidas duplicadas.
- El mismo `asset` se reutiliza para vincular múltiples referencias/versiones.
- En re-ejecuciones con el mismo archivo, detecta `SKIP_ALREADY_LINKED` comparando el asset por hash contra los links existentes.

## Notas de implementación
- El motor de matching/parsing es compartido con el flujo de isométricos (`execution/lib/bulkImportHelpers.ts`).
- `src/lib/productDocuments.ts` no se puede importar desde scripts ts-node (usa `server-only`); el slug público se genera inline en el script.
- Al insertar se respeta la constraint `product_asset_links_single_target_check`: exactamente un destino no nulo entre referencia/versión/sku/family/type/proceso/destino/global. `sku_id` siempre NULL para vistas (agnósticas de color).