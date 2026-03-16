# Documentación Técnica Automática - FPK

Este proyecto es una plataforma avanzada diseñada para automatizar la creación y gestión de documentación técnica, etiquetas y fichas técnicas de productos.

## 🚀 Propósito
Facilitar la generación de activos técnicos (isométricos, etiquetas, manuales) mediante un motor de reglas inteligente y una integración directa con repositorios de código y datos maestros.

## 🏗️ Arquitectura (3 Capas)
Siguiendo los estándares de desarrollo de alta confiabilidad, la APP se divide en:
1.  **Capa de Directiva (Layer 1)**: Procedimientos estándar (SOP) en Markdown que definen *qué* hacer (ubicados en `directives/`).
2.  **Capa de Orquestación (Layer 2)**: Lógica de decisión ejecutada por el asistente de IA (Antigravity).
3.  **Capa de Ejecución (Layer 3)**: Scripts deterministas en Python que realizan el trabajo pesado, como interactuar con APIs o procesar datos (ubicados en `execution/`).

## 🛠️ Stack Tecnológico
-   **Frontend/Backend**: Next.js (App Router), React, TypeScript.
-   **Base de Datos**: Prisma ORM con SQLite (MVP) / Supabase.
-   **Estética**: Diseño premium con Vanilla CSS y componentes personalizados.
-   **Automatización**: Scripts de Python para operaciones de GitHub y procesamiento de reglas.

## 📂 Estructura del Proyecto
-   `web/`: Código fuente de la aplicación web Next.js.
-   `execution/`: Scripts de Python para tareas automáticas.
-   `directives/`: Documentación de procesos y guías para la IA.
-   `prisma/`: Esquemas de base de datos y scripts de sembrado (seeding).

## ⚙️ Configuración y Uso
1.  **Requisitos**: Node.js v18+, Python 3.x.
2.  **Instalación**:
    ```bash
    cd web
    npm install
    pip install requests python-dotenv
    ```
3.  **Variables de Entorno**: Crear un archivo `.env` basado en `.env.example`.
4.  **Ejecución**:
    ```bash
    npm run dev
    ```

## 🤖 Para Agentes de IA (Antigravity / Cursor / Claude)
Si eres un agente de IA trabajando en este proyecto:
- **Arquitectura de 3 Capas**: Sigue estrictamente el archivo `AGENTS.md`. No mezcles lógica de negocio en el frontend; usa scripts en `execution/` y defínelos en `directives/`.
- **Contexto**: Lee siempre `directives/github_integration.md` antes de realizar operaciones con GitHub.
- **Herramientas**: Asegúrate de tener `requests` y `python-dotenv` instalados para ejecutar los scripts de Layer 3.
- **Flujo de Trabajo**: Este proyecto utiliza un flujo basado en tareas y planes de implementación (`implementation_plan.md`).

---
*Desarrollado con ❤️ por el equipo de IA - FPK*
