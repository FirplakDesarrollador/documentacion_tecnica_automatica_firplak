# 🤖 README - AI Agent Context (SamiGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
**Depuración de Deuda Técnica (V6 Final)**: Se ha completado la eliminación física de la tabla `cabinet_products` y la columna obsoleta `product_type` en `product_references`. El sistema opera ahora bajo un esquema relacional normalizado y optimizado.
**Estandarización Global ({product_name})**: Se unificó la identidad de los productos reemplazando `cabinet_name` por `product_name` en toda la UI, lógica de negocio y motores de validación, garantizando consistencia en el Catálogo Maestro.
**Gobernanza de Secretos (MCP Security)**: Implementación de sincronización automática de credenciales para el servidor MCP, eliminando tokens hardcoded y priorizando el uso de variables de entorno seguras.
**Evolución Operativa (AI Agent Skills)**: Integración de un sistema de habilidades autónomas (`skills/`) y workflows refinados para la gestión del ciclo de vida del desarrollo (release, audit, archive).
**Soporte de Variable `version_label`**: Integración de la variable `version_label` (de la tabla `product_versions`) en el constructor de reglas de nomenclatura en español, inglés (constructor de orden) y en el motor de traducción y parseo de código SKU SAP, permitiendo personalizar los nombres dinámicamente con la etiqueta de versión.
**Traducción Adaptativa al Inglés Corregida**: Se solucionó la omisión del nombre del producto en las traducciones al inglés al corregir la variable desactualizada `cabinet_name` a `product_name` en la tabla de configuración `public.naming_config_en` de Supabase.
**Filtro de Búsqueda Persistente en Generar**: Implementación de un filtro de texto por nombre/color en `/generate` que persiste al cambiar familia o referencia, con búsqueda híbrida cliente+servidor y límite dinámico de consulta (200→1000) para garantizar resultados de todas las familias seleccionadas.

## 🏗️ Arquitectura de 3 Capas
Este repositorio sigue estrictamente el modelo definido en `AGENTS.md`:
1. **Layer 1: Directives (`directives/`)**: SOPs en Markdown que definen *qué* hacer.
2. **Layer 2: Orchestration (Tú)**: Toma de decisiones y flujo lógico.
3. **Layer 3: Execution (`execution/`)**: Scripts en Python deterministas.

## 📚 Knowledge Items (KIs) — Memoria Técnica
- Los KIs del proyecto viven en `.gemini/antigravity/knowledge/` y están organizados por tema (subcarpetas).
- KI Reciente (Editor Masivo y Mutación JSONB): `.gemini/antigravity/knowledge/mass_reference_editor_and_jsonb_mutations/artifacts/knowledge_item.md`
- KI Reciente (isométricos/huérfanos/asociación masiva): `.gemini/antigravity/knowledge/isometrics_orphans_and_mass_association/KI.md`
- KI Reciente (Mass Import V6 desde SAP): `.gemini/antigravity/knowledge/mass_import_v6_products/artifacts/knowledge_item.md`
- KI NUEVO (Autocompletado Inteligente): `.gemini/antigravity/knowledge/smart_form_autocompletion_engine/artifacts/knowledge_item.md`
- KI Actualizado (Motor Bilingüe y Diagnóstico): `.gemini/antigravity/knowledge/bilingual_translation_engine_v3_23/artifacts/translation_engine_guide.md`

## 🛠️ Tecnologías Clave
- **Frontend/Backend**: Next.js 16+ (App Router), React 19.
- **Autenticación**: Supabase Auth con patrón **Proxy (ex-Middleware)**.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Gobernanza de Supabase MCP**: Se prioriza la lógica DB-First: Usar Triggers, Funciones RPC y Views.
- **Patrón JSONB Quirúrgico**: Uso de operadores `||` y `-` en RPCs para mutaciones atómicas en `ref_attrs`.

## 🗝️ Información de Dominio (Firplak)
- **Gobernanza de Esquema**: La familia (`families`) es la fuente de verdad técnica para los atributos de sus referencias.
- **Patrón de Limpieza Profunda**: Al borrar un asset, se realiza una desconexión automática en JSONB y eliminación física del Storage.
- **🛡️ Gobernanza de Contexto (REGLA)**: El Agente debe avisar proactivamente al usuario de archivar la sesión (`/archive-session`) tras hitos importantes.

## 🚀 Próximos Pasos (Sugerencia)
1.  **Validar Nombres en Inglés**: Confirmar con el usuario la correcta generación de nombres en inglés en las plantillas PDF/JPG en caliente.
2.  **Saneamiento Masivo**: Utilizar el nuevo Editor de Referencias para normalizar los campos `special_label` y `designation` en todo el catálogo.
3.  **Integración de Atributos en Plantillas**: Configurar las plantillas de etiquetas para consumir los nuevos `dynamic_attrs` (ej. mostrar el sello PUR si existe).
4.  **Migración de Base de Datos**: Mover los modelos de Prisma de SQLite a PostgreSQL (Supabase) para asegurar persistencia en Vercel.
5.  **Mantenimiento de Secretos MCP**: Usar `node execution/sync_mcp_config.js` para mantener las claves de Antigravity sincronizadas con el `.env` del proyecto.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 💻 Entorno de Desarrollo (Windows)
- **Ruta NPM Global**: `C:\Users\oswaldo.rivera\AppData\Roaming\npm`
- **PowerShell Policy**: `RemoteSigned`

## 🛡️ Terminal Safety Policy
*(Ver archivo original)*
