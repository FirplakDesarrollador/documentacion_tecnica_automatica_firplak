# Traducción Dinámica de Zonas y Ciclo de Vida de Plantillas
Last accessed: 2026-05-04T10:31:00-05:00

## 🎯 Objetivo de la Sesión
Eliminar la dependencia de traducciones estáticas (bugs de "Bathroom" forzado) mediante un motor dinámico basado en glosario y mejorar la flexibilidad operativa del diseñador de plantillas permitiendo duplicación con redimensionamiento y edición de metadatos.

## 🛠️ Logros Técnicos

### 1. Motor de Traducción Dinámica (Glosario-First)
- **Resolución On-Demand**: Implementación de `resolveZoneHomeEnAction` en `actions.ts`. Este patrón permite que los componentes de cliente obtengan traducciones técnicas del glosario de Supabase sin persistir datos redundantes en la tabla de productos.
- **Inyección en Pipeline de Hidratación**: Se integró la lógica en `hydrateTemplateElements` (`exportUtils.ts`). Ahora, cualquier documento (Preview, Bulk Export, Post-Save) inyecta `zone_home_en` automáticamente antes de pasar al motor de renderizado.
- **Estado de `technical_description`**: Se identificó que este campo aún tiene una dependencia fuerte del código fuente (`productUtils.ts`). Actualmente se trabaja en desacoplarlo para que sea 100% configurable desde el glosario o reglas de negocio, mejorando la coherencia técnica entre idiomas.

### 2. Flexibilidad en Gestión de Plantillas
- **Duplicación Inteligente**: El proceso de clonado ahora permite sobrescribir `width_mm` y `height_mm` en el momento de la creación. La orientación (horizontal/vertical) se recalcula automáticamente en el servidor.
- **Edición de Metadatos Post-Creación**: Implementación de `EditTemplateDialog`. Permite renombrar y redimensionar plantillas existentes desde la tabla principal sin entrar al editor visual.
- **Protección de Datos**: Se refactorizó `updateTemplate` para que el campo `elements_json` sea opcional. Esto evita que cambios accidentales en el nombre o medidas borren el diseño gráfico de la plantilla.

## 📝 Aprendizajes de Negocio (Firplak)
- **Estandarización Estética**: La zona técnica en inglés debe presentarse siempre en minúsculas (ej: "Zone: bathroom") para mantener la armonía visual de las etiquetas de exportación.
- **Gobernanza de Nomenclatura**: Se refuerza el uso del glosario como única fuente de verdad técnica. El sistema ahora genera alertas de "Missing Terms" para obligar a la alimentación manual de nuevas zonas técnicas, evitando fallbacks genéricos.

## 🚀 Próximos Pasos
- **Configurabilidad de Technical Description**: Mover la lógica de construcción de este string desde `productUtils.ts` hacia el motor de reglas o una configuración de plantilla para que el usuario defina su estructura.
- **Optimización de Caché de Glosario**: Evaluar el impacto en exportaciones de más de 500 registros para asegurar que las llamadas concurrentes a `resolveZoneHomeEnAction` no afecten el rendimiento.

---

## 🔁 Consistencia ES/EN por Reglas (activeVariableIds) — 2026-05-12
- **Problema observado**: El nombre EN podía incluir variables (ej. `private_label_client_name`) aunque ES no las hubiese emitido en nomenclatura, por llamadas al traductor sin restricción de variables activas.
- **Directiva**: La traducción EN debe recibir `activeVariableIds` producidos por `evaluateProductRules(...)` para que EN solo emita lo que ES realmente “usó”.
- **Nota**: En formularios/acciones de UI, evitar pasar parámetros incorrectos al traductor (ej. no pasar el string ES como `targetEntity`).

## Persistencia selectiva de EN y `needs_review` — 2026-06-24
- El motor de nomenclatura EN distingue entre:
  - `finalNameEn`: traduccion generada para mostrar/diagnosticar.
  - `storableFinalNameEn`: traduccion apta para persistir.
- Si `translateProductToEnglish(...)` devuelve `missingTerms.length > 0` o el resultado viola reglas de validacion, `isValid` pasa a `false`.
- En ese caso, `computeNameWithNamingComponents(...)` deja `storableFinalNameEn = ''` y `validation_status = 'needs_review'`.
- `masterNaming.ts` persiste `storableFinalNameEn`, no `finalNameEn`. Por eso puede ocurrir que el recalculo "corra bien" pero `final_base_name_en` o `final_complete_name_en` queden vacios a proposito.
- Interpretacion operativa:
  - `naming_stale = false` no significa que EN haya quedado poblado.
  - Si el campo EN quedo vacio junto con `needs_review`, el caso correcto es auditar glosario / normalizacion de tokens, no reprocesar ciegamente.

### Caso real observado
- Un recalc de `final_base_name_en` quedo vacio aunque el proceso habia corrido y cerrado su bandera stale.
- La causa probable fue desalineacion entre el valor normalizado emitido por nomenclatura (`CANTO 2 MM`) y la variante existente en glosario (`CANTO 2MM`).
- Leccion: variantes de spacing en bloques tecnicos pueden bloquear la persistencia del ingles aunque el nombre ESP exista y el pipeline no falle tecnicamente.

## Pending y escaneo de traduccion bajo demanda - 2026-06-24
- `/pending` no debe ejecutar el escaneo completo de glosario/naming durante la carga inicial.
- La pantalla inicial puede mostrar una senal barata de casos por identificar (`needs_review` o campos EN vacios con fuente ES), pero el detalle real de terminos faltantes debe vivir detras del boton `Escanear conflictos de traduccion`.
- No usar `naming_stale` como conteo inicial de conflictos de traduccion: puede representar trabajo pendiente de recomputacion, no una falta real de glosario.
- Ver KI `pending_structural_rpc_and_translation_scan`.

## Transformaciones semanticas de texto en plantillas — 2026-06-24
- Las opciones de transformacion visual del builder no deben depender solo de CSS (`text-transform`) cuando el texto contiene variables tecnicas hidratadas.
- `capitalize` / "Tipo Titulo" debe resolver tokens por helper compartido para soportar colores y nombres compuestos:
  - `MARFIL/YALAA - BLANCO CARB2` -> `Marfil/Yalaa - Blanco CARB2`
  - `OLIVA/JAYKA - BLANCO CARB2` -> `Oliva/Jayka - Blanco CARB2`
- `sentence` / "Mayuscula inicial tecnica" debe convertir nombres completos a frase tecnica sin reconstruir el nombre en la plantilla.
- La logica compartida vive en `src/lib/templates/textTransforms.ts` y debe usarse tanto en preview del builder como en hidratacion/export (`hydrateTemplateElements(...)`) para evitar divergencias PDF/JPG vs UI.
- Reglas de negocio:
  - Preservar acronimos/codigos tecnicos como `RH`, `RFE`, `SFE`, `LVM`, `PUR`, `CARB2`, `SAP`, `SKU`.
  - Tratar unidades de medida como unidades, no acronimos: `MM`, `CM`, `IN` deben quedar `mm`, `cm`, `in`; medidas compuestas como `92INX24IN` pueden quedar `92inx24in`.
  - Mantener separadores utiles (`/`, `-`) y aplicar casing por segmento, no solo por palabra separada por espacios.
- Directiva: nuevas transformaciones de texto en plantillas deben implementarse como transformaciones semanticas post-hidratacion y luego mapear a `text-transform: none` en CSS si no son transformaciones CSS nativas.
