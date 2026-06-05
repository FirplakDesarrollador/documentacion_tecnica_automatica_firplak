---
name: code-quality-guardrails
description: Aplica el workflow del repo para errores de lint, TypeScript, suppressions, `eslint-disable`, `@ts-ignore`, deuda en scripts auxiliares y separacion entre salud de app y utilitarios heredados.
---

# code-quality-guardrails

## Objetivo

Ejecutar la politica del repo para que los errores de calidad se corrijan con tipado, estructura y chequeos utiles, no con suppressions por defecto.

## Fuente de verdad

- `directives/code_quality_guardrails.md`

## Instrucciones

1. Abre y sigue `directives/code_quality_guardrails.md`.
2. Separa siempre el diagnostico entre:
   - app principal (`src/`, build, typecheck)
   - scripts auxiliares (`scripts/`, `execution/`, `print-agent/`, `prisma/`)
3. Corre los comandos del SOP segun las carpetas tocadas.
4. Si un archivo tocado ya tiene suppressions, intenta retirar alguna antes de cerrar.
5. Bloquea suppressions nuevas con `npm run check:diff`.
