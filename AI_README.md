# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Consolidación de la experiencia de usuario (UX Premium) con la implementación del Sidebar colapsable persistente y la optimización del modo 'Canvas Full Screen' para el Builder. Se estabilizó el pipeline de renderizado mediante señales de sincronización (`data-scaling`) y se completó la transición a seguridad RLS en Supabase. El sistema ahora opera en un entorno de 'Gobernanza de Terminal Seguro', permitiendo una operación del Agente de IA más rápida y fluida.

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
- **No inventes herramientas**: Revisa siempre `execution/` por scripts existentes antes de crear nuevos.
- **Actualiza el Contexto**: Usa la habilidad `project-context-keeper` para mantener este archivo actualizado cuando realices cambios estructurales significativos.
- **Sigue el Workflows**: Usa `/release` para subir cambios y `/archive-session` para cerrar.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 🛡️ Terminal Safety Policy
*(Tabla de políticas de seguridad omitida por brevedad, ver archivo original)*
