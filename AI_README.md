# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Infraestructura de Datos y Gobernanza Institucional (v1.2.3): Se implementó el **"Filtro Madre" centralizado** para garantizar consistencia en todo el aplicativo y se activó la **traducción al inglés en tiempo real** para nuevos ingresos. Se expandieron las capacidades de Gestión de Familias (CRUD y soporte Mayúsculas/Minúsculas) y se estabilizó el sistema de **Clonación de Plantillas**. El proyecto fue purgado de archivos temporales y alineado para su despliegue en la infraestructura estratégica de **FirplakDesarrollador**, garantizando un entorno de producción limpio y escalable.

## 🏗️ Arquitectura de 3 Capas
Este repositorio sigue estrictamente el modelo definido en `AGENTS.md`:
1. **Layer 1: Directives (`directives/`)**: SOPs en Markdown que definen *qué* hacer.
2. **Layer 2: Orchestration (Tú)**: Toma de decisiones y flujo lógico.
3. **Layer 3: Execution (`execution/`)**: Scripts en Python deterministas que *hacen* el trabajo pesado (GitHub API, Supabase, Procesamiento de datos).

## 🛠️ Tecnologías Clave
- **Frontend/Backend**: Next.js 15+ (App Router), React 19.
- **Renderizado de Exportación**: Puppeteer (Backend) con inyección de HTML sincronizado.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Automatización**: Python 3.x para herramientas de soporte.
- **AI Sync**: El flujo `/release` sincroniza este contexto automáticamente con GitHub.

## 🗝️ Información de Dominio (Firplak)
- **Gobernanza de Familias**: Las familias definen `allowed_lines`, `rh_default` y `assembled_default`. Los productos heredan estos valores al crearse.
- **Glosario**: La traducción a inglés utiliza el motor determinista v3.23. Se optimiza para ignorar nombres propios (estrategia `preserve`) evitando alertas de traducción pendientes para referentes como "POLOCK".
- **Nomenclatura**: Es reactiva con debounce de 800ms. Las reglas de ingeniería redondean a 1 decimal en pulgadas.
- **Isométricos**: Sincronizados automáticamente por el par (Familia-Referencia). Se validan mediante lógica dual (`isometric_asset_id` o `isometric_path`).
- **Plantillas**: Tienen gobernanza de formatos (`export_formats` = `PDF, JPG`).
- **Versionado (Ciclo de 10)**: Se usa una lógica personalizada (v1.x.9 ➡️ v1.y.0) gestionada por `execution/version_bump.py`.

## 🤖 Instrucciones para Agentes
- **⚠️ Prioridad de Bugfix**: El motor `codeParser` está fallando al rellenar campos históricos (`Smart Lookup`). Antes de añadir nuevas features, debuguear la lógica de fallback en `codeParser.ts`.
- **Estructura de Layout**: Preferir **Flexbox** sobre CSS Grid para contenedores de alto nivel (Sidebar/Main) para evitar bugs de interceptación de eventos producidos por elementos portales o overlays.
- **No inventes herramientas**: Revisa siempre `execution/` por scripts existentes antes de crear nuevos.
- **Actualiza el Contexto**: Usa la habilidad `project-context-keeper` para mantener este archivo actualizado cuando realices cambios estructurales significativos.
- **Sigue el Workflows**: Usa `/release` para subir cambios y `/archive-session` para cerrar.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 🛡️ Terminal Safety Policy
*(Tabla de políticas de seguridad omitida por brevedad, ver archivo original)*
