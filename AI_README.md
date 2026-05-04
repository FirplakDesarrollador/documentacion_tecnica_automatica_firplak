# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Evolución Relacional V6.1 y Motor de Composición: Se ha consolidado la migración de la tabla monolítica `cabinet_products` hacia un esquema relacional desacoplado, permitiendo la integración de diversos tipos de productos con alta flexibilidad. Se implementó el `Product Composer` (V2.1) para una nomenclatura técnica inteligente y se unificó la lógica de filtrado en un motor centralizado (`filters.ts`). El sistema ahora cuenta con un pipeline de traducción bilingüe optimizado para herrajes técnicos y una batería de más de 50 scripts de auditoría para garantizar la integridad de los datos históricos durante la transición. Se mantiene el soporte legado mediante vistas de composición mientras se eliminan las dependencias finales.

## 🏗️ Arquitectura de 3 Capas
Este repositorio sigue estrictamente el modelo definido en `AGENTS.md`:
1. **Layer 1: Directives (`directives/`)**: SOPs en Markdown que definen *qué* hacer.
2. **Layer 2: Orchestration (Tú)**: Toma de decisiones y flujo lógico.
3. **Layer 3: Execution (`execution/`)**: Scripts en Python deterministas que *hacen* el trabajo pesado (GitHub API, Supabase, Procesamiento de datos).

## 🛠️ Tecnologías Clave
- **Frontend/Backend**: Next.js 15+ (App Router), React 19.
- **Renderizado de Exportación**: Puppeteer (Backend) con inyección de HTML sincronizado. Soporte para **File System Access API** en el cliente para guardado directo en disco.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Glosario (Caché)**: Patrón `forceRefresh` para invalidación de caché bajo demanda tras aprendizaje manual.

## 🗝️ Información de Dominio (Firplak)
- **Migración V6.1 y Desacople Legacy**: El sistema ha migrado de la tabla plana `cabinet_products` a un modelo relacional normalizado:
  - `product_references`: Datos base de la referencia (Nombre, Designación, Isométrico base).
  - `product_versions`: Overrides técnicos y de validación por versión (SKU Base).
  - `product_skus`: Materialización final por color (SKU Completo).
  - **Regla de Oro**: Ningún módulo nuevo debe leer ni escribir en `cabinet_products`. La consulta se realiza a través de `v_ui_generate_list`.
- **Precedencia de Isométricos**: La lógica en `product_composer.ts` prioriza `version_attrs.isometric_asset_id` sobre `product_references.isometric_asset_id`. Esto permite versiones con isométricos específicos.
- **Seguridad de Assets**: `deleteAssetAction` bloquea el borrado si el ID está presente en `product_references` o `product_versions.version_attrs`.
- **Materialización de Nombres**: Los nombres ES/EN se materializan en `product_skus` durante la creación/edición. Si aparecen como "Sin nombre", es necesario re-ejecutar el motor de reglas con el contexto completo del producto.
- **Filtros Madre**: El archivo `src/lib/data/filters.ts` centraliza la resolución de nombres de familias y referencias. Prioriza coincidencia exacta para evitar errores de prefijos (Caso COC01).

- **⚠️ Limitación de exec_sql**: No utilices cláusulas `WITH` (CTE) en consultas enviadas a `dbQuery` si esperas resultados de retorno, ya que la función RPC `exec_sql` ya las usa internamente y el anidamiento rompe el retorno de datos. Usa `INSERT/UPDATE ... RETURNING *`.
- **Estructura de Layout**: Preferir **Flexbox** sobre CSS Grid para contenedores de alto nivel (Sidebar/Main) para evitar bugs de interceptación de eventos producidos por elementos portales o overlays.
- **No inventes herramientas**: Revisa siempre `execution/` por scripts existentes antes de crear nuevos.
- **Actualiza el Contexto**: Usa la habilidad `project-context-keeper` para mantener este archivo actualizado cuando realices cambios estructurales significativos.
- **Sigue el Workflows**: Usa `/release` para subir cambios y `/archive-session` para cerrar.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 🛡️ Terminal Safety Policy
*(Tabla de políticas de seguridad omitida por brevedad, ver archivo original)*
