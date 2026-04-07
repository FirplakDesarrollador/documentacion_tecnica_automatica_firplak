# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Se ha consolidado de forma definitiva la arquitectura universal de Iconos Condicionales (RH, Canto, Bisagras, Riel) bajo un modelo Data-Driven con interpolación léxica (`{caption_es}`, `{caption_en}`). La base de datos fue refactorizada estructuralmente agregando y saneando columnas matriciales (ej. `bisagras` alimentada de `cabinet_name`). El procesamiento destructurado vive exclusivamente en `productUtils.ts` (`rail_mode`, preloads nulos), delegando variables limpias al renderizador `DynamicImageElement`. Esto elimina hardcodings en las plantillas, ocultando inteligentemente (sin bugs visuales) los recursos donde el atributo no aplica.

## 🏗️ Arquitectura de 3 Capas
Este repositorio sigue estrictamente el modelo definido en `AGENTS.md`:
1. **Layer 1: Directives (`directives/`)**: SOPs en Markdown que definen *qué* hacer.
2. **Layer 2: Orchestration (Tú)**: Toma de decisiones y flujo lógico.
3. **Layer 3: Execution (`execution/`)**: Scripts en Python deterministas que *hacen* el trabajo pesado (GitHub API, Supabase, Procesamiento de datos).

## 🛠️ Tecnologías Clave
- **Frontend/Backend**: Next.js 15+ (App Router), React 19.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Automatización**: Python 3.x para herramientas de soporte.
- **AI Sync**: El flujo `/release` sincroniza este contexto automáticamente con GitHub.

## 🗝️ Información de Dominio (Firplak)
- **Glosario**: La traducción a inglés ya no depende de un modelo de IA puro, sino de un glosario estructurado y reglas de formación de nombres en `web/src/lib/engine/ruleTranslator.ts`.
- **Exportación**: Soporta PDF y JPG. La lógica de validación es obligatoria antes de exportar.
- **Versionado (Ciclo de 10)**: Se usa una lógica personalizada (v1.x.9 ➡️ v1.y.0) gestionada por `execution/version_bump.py`. No usar `npm version` estándar.

## 🤖 Instrucciones para Agentes
- **No inventes herramientas**: Revisa siempre `execution/` por scripts existentes antes de crear nuevos.
- **Actualiza el Contexto**: Usa la habilidad `project-context-keeper` para mantener este archivo actualizado cuando realices cambios estructurales significativos.
- **Sigue el Workflows**: Usa `/release` para subir cambios y `/start-app` para probar.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 🛡️ Terminal Safety Policy
Los siguientes comandos base han sido evaluados y son recomendados para ser añadidos al **Allow List Terminal Commands** por ser informativos o de operación rutinaria (modo turbo):

| Comando | Razón / Riesgo | Clasificación |
|---------|----------------|---------------|
| `git status` | Informativo. Solo lectura del estado actual del repositorio. | ✅ Seguro |
| `Get-NetTCPConnection` | Requerido para verificar disponibilidad de puertos antes de iniciar el servidor. | ✅ Seguro |
| `npm version` | Informativo. Muestra la versión actual de la aplicación. | ✅ Seguro |
| `Select-String (PowerShell)` | Informativo/Lectura. Búsqueda de lógica y patrones en archivos de código fuente. | ✅ Seguro |
| `Format-Table (PowerShell)` | Herramienta de visualización estructurada para resultados de terminal. | ✅ Seguro |
| `grep (Búsqueda/Lectura)` | Comando estándar para buscar patrones dentro de archivos de texto. | ✅ Seguro |
| `Select-String` | Búsqueda de patrones en archivos de código fuente (sólo lectura). | ✅ Seguro |
| `Get-ChildItem` | Comando de inspección y listado de archivos en PowerShell. | ✅ Seguro |
| `Format-Table` | Visualización de resultados estructurados en la terminal. | ✅ Seguro |
