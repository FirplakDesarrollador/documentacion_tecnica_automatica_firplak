# 🤖 README - AI Agent Context (Firplak DocGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estratégico y operativo necesario para navegar y construir eficientemente en este proyecto.

## 📌 Visión General
Evolución Relacional V6.1 y Gobernanza de Activos: Se ha consolidado el motor de isométricos con el patrón **"Select-then-Persist"**, permitiendo asociar recursos a productos nuevos sin errores de base de datos. Se implementó una **Limpieza Profunda en Cascada** (manual) para asegurar que la eliminación de assets no deje rastro en las tablas relacionales ni en el Storage físico. La lógica de filtros se centralizó en `filters.ts` para garantizar coherencia en toda la aplicación.
Gobernanza de Memoria: Se estableció una separación estricta entre Memoria Operativa (Git) y Memoria Técnica (KIs). Se resolvió el **Bucle de Hidratación en /rules** mediante la directiva `force-dynamic`, un patrón vital para páginas con fetching asíncrono en Next.js 15.
- **Migración a Raíz Única**: Se consolidó el repositorio eliminando la subcarpeta `web/`. El aplicativo ahora es compatible con el despliegue automático en Vercel, gestionando correctamente el schema de Prisma en el pipeline de build.
- **Registro Dinámico de Colores (NUEVO)**: Se eliminó el bloqueo por error de llave foránea (`fk_skus_color_code`) al permitir la creación de nuevos registros en la tabla `public.colors` directamente desde el `ProductForm.tsx`. El sistema detecta códigos inexistentes y solicita el nombre al usuario antes de proceder con el guardado transaccional.

## 🏗️ Arquitectura de 3 Capas
Este repositorio sigue estrictamente el modelo definido en `AGENTS.md`:
1. **Layer 1: Directives (`directives/`)**: SOPs en Markdown que definen *qué* hacer.
2. **Layer 2: Orchestration (Tú)**: Toma de decisiones y flujo lógico.
3. **Layer 3: Execution (`execution/`)**: Scripts en Python deterministas que *hacen* el trabajo pesado (GitHub API, Supabase, Procesamiento de datos).

## 🛠️ Tecnologías Clave
- **Frontend/Backend**: Next.js 16+ (App Router), React 19.
- **Autenticación**: Supabase Auth con patrón **Proxy (ex-Middleware)**. Protección de rutas internas forzada por sesión de cookies.
- **Renderizado de Exportación**: Puppeteer (Backend) con inyección de HTML sincronizado. Soporte para **File System Access API** en el cliente para guardado directo en disco.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Glosario (Caché)**: Patrón `forceRefresh` para invalidación de caché bajo demanda tras aprendizaje manual.
- **Gobernanza de Supabase MCP**: Se detectaron fallos de conexión (`EOF`) en el servidor MCP posiblemente por restricciones de herramientas o expiración de tokens. **Se recomienda priorizar `exec_sql` (RPC)** para operaciones de datos por su alta fiabilidad y velocidad.
- **Despliegue en Vercel**: El entorno serverless de Vercel requiere que la carpeta `prisma/` NO esté en `.vercelignore` para que el `postinstall` genere el cliente. SQLite y Puppeteer local son incompatibles con la arquitectura serverless de larga duración en Vercel.
- **Gestión de Access Tokens**: El `SUPABASE_ACCESS_TOKEN` es un PAT global obtenido en Account Settings > Access Tokens. Es vital para que el MCP descubra proyectos.
- **Proxy Architecture (NUEVO)**: En Next.js 16.1.6, el archivo `middleware.ts` es reemplazado por `src/proxy.ts` (export `proxy`). Gestiona el refresco de sesión de Supabase Auth.

## 🗝️ Información de Dominio (Firplak)
- **Gobernanza de Isométricos**: Al asociar un isométrico, la propagación automática ahora es sensible al `version_code`. No asumas que una misma referencia usa el mismo isométrico en todas sus versiones; verifica siempre el `isometric_from_different_version` flag.
- **Patrón de Limpieza Profunda (NUEVO)**: Al borrar un asset, el sistema realiza una desconexión automática en `product_references` y `product_versions` (vía operador `-` en JSONB) y elimina el archivo físico del Storage. Esto reemplaza el antiguo bloqueo de borrado.
- **Seguridad de Acceso**: El aplicativo es cerrado. Solo usuarios pre-autorizados en Supabase Auth pueden ingresar. La pantalla de login (`/login`) oculta el Sidebar institucional.
- **Validación de Exportación**: Solo productos en estado `ready` pueden ser exportados.
- **Saneamiento de SAP**: Los datos provenientes de SAP pueden traer el caracter corrupto "" en lugar de "Ñ". El sistema debe sanear esto antes de cualquier operación de nomenclatura.
- **Migración V6.1**: Se ha validado la eliminación exitosa de productos específicos (ej. VCOC01-0200-000-0493) tanto en el esquema nuevo como en el legacy.
- **Rama de Lanzamiento**: El estándar de push ha migrado de `Oswaldo` a **`Oswaldo_cambios`**.
- **🛡️ Gobernanza de Contexto (REGLA)**: El Agente debe avisar proactivamente al usuario de archivar la sesión (`/archive-session`) cuando se detecten auditorías masivas de archivos (>50) o la conversación supere los 10 turnos con logs extensos. **No usar archivos fuente para bitácoras**.
- **⚠️ Limitación de exec_sql**: No utilices cláusulas `WITH` (CTE) en consultas enviadas a `dbQuery` ya que rompe el retorno de datos. Usa `INSERT/UPDATE ... RETURNING *`.
- **Estructura de Layout**: Preferir **Flexbox** sobre CSS Grid para contenedores de alto nivel (Sidebar/Main) para evitar bugs de interceptación de eventos producidos por elementos portales o overlays.
- **Normalización de Códigos SAP (NUEVO)**: Todos los códigos de color deben normalizarse a 4 dígitos (`0434`) en la columna `code_4dig` y a su valor numérico sin ceros (`434`) en `code_short`. La lógica de padding debe aplicarse antes de cualquier consulta a `public.colors` tanto en el parser como en la UI.

## 🚀 Próximos Pasos (Sugerencia)
1.  **Migración de Base de Datos**: Mover los modelos de Prisma de SQLite a PostgreSQL (Supabase) para asegurar persistencia en Vercel.
2.  **Dashboard de Auditoría**: Crear una vista para que el administrador vea los usuarios activos de Supabase Auth desde la interfaz.
3.  **Refactor de Filtros**: Validar que todas las consultas SQL crudas en `filters.ts` se ejecuten sin errores en el nuevo entorno unificado.
4.  **Optimización de Búsqueda de Colores**: Considerar una pre-carga inteligente de colores en `datalistOptions` para reducir latencia en el despliegue de opciones en tiempo real.

---
*Este archivo es mantenido autónomamente por los agentes de IA que colaboran en el proyecto.*

## 💻 Entorno de Desarrollo (Windows)
- **Ruta NPM Global**: `C:\Users\oswaldo.rivera\AppData\Roaming\npm` (Debe estar en el PATH).
- **PowerShell Policy**: `RemoteSigned` (CurrentUser).
- **OpenCode Integration**: Se utiliza para conectar la terminal con el agente. Si el comando `opencode` falla tras una instalación, se requiere reiniciar VS Code.

## 🛡️ Terminal Safety Policy
*(Ver archivo original para tabla completa)*
