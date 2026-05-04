---
description: Flujo para versionar y subir cambios a GitHub en la rama Oswaldo_cambios
---

// turbo-all

1. **Fase de Auditoría Profunda (Obligatorio)**: Ejecuta `git status` y `git diff --name-only` para identificar TODOS los archivos modificados o creados en la sesión. No confíes solo en la memoria de la conversación.

2. **Extracción de Pilares Técnicos**: Basándote en la auditoría del paso 1, identifica los hitos arquitectónicos (ej: nuevas tablas, refactorización de motores, lógica de negocio). Cítalos en una lista detallada para el usuario.

3. **Validación con el Usuario**: Presenta la lista de pilares al usuario y haz la pregunta explícita: **"¿Me falta algún hito importante o hallazgo técnico antes de proceder?"**. No continúes hasta obtener confirmación o corrección.

4. **Sincronización de Contexto AI**: Una vez validados los pilares, actualiza la sección "## 📌 Visión General" en `AI_README.md` con el resumen final consensuado utilizando `replace_file_content`.

5. **Operación Git & Despliegue**: Solo después de la validación, procede con:
   - Limpieza de bloqueos: `Remove-Item -Path ".git\index.lock" -ErrorAction SilentlyContinue`
   - Git Add & Commit con mensaje descriptivo de los pilares.
   - Incremento de versión con el script `execution/version_bump.py`.
   - Push a la rama `Oswaldo_cambios`.

6. **Confirmación Final**: Informa la versión alcanzada y el éxito de la sincronización.

