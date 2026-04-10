# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Implementación de Sidebar colapsable con persistencia en `localStorage`, garantizando un UX premium y mayor espacio de trabajo. Se alcanzó la madurez de seguridad mediante políticas RLS en Supabase y la expansión de la `Terminal Safety Policy`. El motor de traducción v3.23 ahora cuenta con diagnóstico de red en tiempo real y una arquitectura de renderizado basada en señales (`data-scaling`), optimizando la paridad visual en exportaciones PDF/JPG de alta fidelidad.

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
- **Glosario**: La traducción a inglés utiliza el motor determinista v3.23. Se optimizó para ignorar nombres propios (estrategia `preserve`) evitando alertas de traducción pendientes para referentes como "POLOCK".
- **Nomenclatura**: Es reactiva con debounce de 800ms. Las reglas de ingeniería redondean a 1 decimal en pulgadas.
- **Isométricos**: Sincronizados automáticamente por el par (Familia-Referencia). Se validan mediante lógica dual (`isometric_asset_id` o `isometric_path`).
- **Plantillas**: Tienen gobernanza de formatos (`export_formats` = `PDF, JPG`).
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
| `Remove-Item -Path *.index.lock` | Operación de limpieza necesaria para desbloquear procesos de Git tras fallos en la terminal. | ✅ Seguro |
| `git log` | Informativo. Lectura de historial de cambios para resúmenes técnicos. | ✅ Seguro |
| `git diff` | Informativo. Verificación de cambios exactos antes de proceder con un commit. | ✅ Seguro |
| `Get-Process` | Informativo. Chequeo de procesos en ejecución para diagnosticar ocupación de puertos. | ✅ Seguro |
| `Start-Sleep` | Utilidad. Pausas necesarias para sincronización de procesos en scripts automáticos. | ✅ Seguro |
| `Start-Process` | Operacional. Utilizado para lanzar Google Chrome o procesos en segundo plano. | ✅ Seguro |
