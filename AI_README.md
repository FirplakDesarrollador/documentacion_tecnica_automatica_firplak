# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Evolución Relacional V6.1 y Motor de Composición: Se ha realizado el push inicial de la migración del esquema relacional desacoplado hacia la rama `Oswaldo_cambios`. El proceso de migración de la tabla monolítica `cabinet_products` está **en progreso** (pendiente verificación final de dependencias legacy). Se implementó el `Product Composer` (V2.1) para nomenclatura inteligente y se centralizó la lógica de filtros en `filters.ts`. Se optimizó el entorno de desarrollo mediante la desactivación de servidores MCP redundantes y la instalación de extensiones críticas para Next.js/Prisma.

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
- **Migración V6.1 (EN PROGRESO)**: Pendiente auditoría final de asociaciones hacia la tabla legacy `cabinet_products` antes de su eliminación definitiva.
- **Rama de Lanzamiento**: El estándar de push ha migrado de `Oswaldo` a **`Oswaldo_cambios`**.
- **🛡️ Gobernanza de Contexto (REGLA)**: El Agente debe avisar proactivamente al usuario de archivar la sesión (`/archive-session`) cuando se detecten auditorías masivas de archivos (>50) o la conversación supere los 10 turnos con logs extensos, para evitar errores de truncamiento ("High Traffic").

- **⚠️ Limitación de exec_sql**: No utilices cláusulas `WITH` (CTE) en consultas enviadas a `dbQuery` si esperas resultados de retorno, ya que la función RPC `exec_sql` ya las usa internamente y el anidamiento rompe el retorno de datos. Usa `INSERT/UPDATE ... RETURNING *`.
- **Estructura de Layout**: Preferir **Flexbox** sobre CSS Grid para contenedores de alto nivel (Sidebar/Main) para evitar bugs de interceptación de eventos producidos por elementos portales o overlays.
- **No inventes herramientas**: Revisa siempre `execution/` por scripts existentes antes de crear nuevos.
- **Actualiza el Contexto**: Usa la habilidad `project-context-keeper` para mantener este archivo actualizado cuando realices cambios estructurales significativos.
- **Sigue el Workflows**: Usa `/release` para subir cambios y `/archive-session` para cerrar.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 🛡️ Terminal Safety Policy
*(Ver archivo original para tabla completa)*
