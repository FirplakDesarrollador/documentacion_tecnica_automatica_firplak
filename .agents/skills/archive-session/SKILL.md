---
name: archive-session
description: Ejecuta el workflow de cierre de sesión (audita cambios y sincroniza aprendizaje en KIs + AI_README).
---

# /archive-session

## Objetivo

Hacer invocable en Codex el workflow del proyecto para cerrar la sesión y persistir aprendizaje en:

- `.gemini/antigravity/knowledge/` (Knowledge Items / KIs)
- `AI_README.md`

## Fuente de verdad (SOP)

Este skill **no redefine** el proceso; únicamente lo ejecuta. La fuente de verdad vive en:

- `.agents/workflows/archive-session.md`

## Instrucciones

1. Abre y sigue el workflow `.agents/workflows/archive-session.md` en orden.
2. Antes de editar KIs, presenta al usuario los “Pilares de Aprendizaje” y pide validación.
3. Tras la validación, aplica cambios quirúrgicos a los KIs y actualiza `AI_README.md`.
4. Reporta qué KIs y archivos fueron actualizados.

## Restricciones

- No escribas logs largos en archivos del repo.
- No reescribas KIs completos: solo agrega/ajusta lo relevante al tema de la sesión.
