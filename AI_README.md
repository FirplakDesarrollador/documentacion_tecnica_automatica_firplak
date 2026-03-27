# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Versión 1.0.8: Refactorización masiva del motor de traducción (translator.ts). Migración de traducción basada en strings a motor adaptativo basado en campos (15+ variables). Inclusión de lógica de deduplicación y chequeo de redundancias inteligentes (ej. Vanity vs LVM).

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

## 🤖 Instrucciones para Agentes
- **No inventes herramientas**: Revisa siempre `execution/` por scripts existentes antes de crear nuevos.
- **Actualiza el Contexto**: Usa la habilidad `project-context-keeper` para mantener este archivo actualizado cuando realices cambios estructurales significativos.
- **Sigue el Workflows**: Usa `/release` para subir cambios y `/start-app` para probar.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*
