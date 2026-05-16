---
description: Flujo para cerrar y archivar sesiones migrando el aprendizaje técnico y de negocio a la memoria a largo plazo (KI) sin afectar Git.
---

// turbo-all

Este flujo asegura que el aprendizaje de **toda la sesión** persista en la memoria a largo plazo de la IA.

1. **Fase de Auditoría de Inteligencia (Obligatorio)**: Ejecuta `git diff --name-only` para identificar el rastro real del código de hoy. Cruza esto con los artefactos y acuerdos iniciales.

2. **Propuesta de Sinapsis (Validar con Humano)**: Antes de archivar, presenta al usuario los **Pilares de Aprendizaje** identificados, especificando para cada uno el **KI (existente o nuevo)** donde se planea almacenar:
   - **Técnico**: (Patrones, APIs, Lógica nueva) -> KI: [ruta]
   - **Negocio/Diseño**: (Reglas Firplak, Resoluciones estéticas) -> KI: [ruta]
   - **Pregunta**: "¿Son estos los hitos que debo memorizar a largo plazo o falta algún aprendizaje vital?"

3. **Sincronización de Knowledge Items (KIs) y AI_README**: Solo tras la validación, actualiza los KIs en `.gemini/antigravity/knowledge/` y el `AI_README.md`. 
   - **Regla de Oro**: NO borrar ni modificar información de los KIs que no esté relacionada con el tema actual. Las actualizaciones deben ser quirúrgicas. Si la información es nueva, agregar nuevos puntos o párrafos según la estructura del KI en lugar de reescribir contenido existente no relacionado.
   - Incluye sugerencias para la próxima sesión.

4. **Confirmación**: Reporta qué KIs fueron actualizados y el cierre exitoso del aprendizaje.

