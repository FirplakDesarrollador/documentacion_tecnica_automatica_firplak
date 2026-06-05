# Directiva: Code Quality Guardrails

Usa esta directiva cuando toques `src/`, `scripts/`, `execution/`, `print-agent/`, `prisma/` o cuando aparezcan errores de ESLint/TypeScript.

## Objetivo

Separar errores de producto, deuda histórica y scripts auxiliares para que las correcciones no terminen en `eslint-disable` por cansancio o ruido operativo.

## Flujo base

1. Si cambias app/producto (`src/`, `next.config.ts`, `eslint.config.mjs`), corre:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build` si tocaste comportamiento o rutas
2. Si cambias scripts auxiliares (`scripts/`, `execution/`, `print-agent/`, `prisma/`), corre:
   - `npm run lint:scripts`
3. Antes de cerrar la tarea, corre:
   - `npm run check:diff`

## Reglas

1. No agregues `eslint-disable`, `@ts-ignore` ni `@ts-nocheck` nuevos.
2. Si una corrección parece exigir suppressions, primero intenta una de estas salidas:
   - extraer tipos compartidos
   - usar `unknown` + narrowing
   - crear una declaración `.d.ts` para extensiones del DOM o librerías
   - mover lógica compleja a una función tipada
3. Si tocas un archivo que ya tiene suppressions, intenta retirar al menos una en esa misma intervención cuando sea razonable.
4. En `src/`, evita introducir `any` nuevo. Si no se puede resolver en la misma tarea, documenta por qué quedó pendiente.
5. En scripts auxiliares, trata `no-explicit-any` como deuda visible, no como razón para bloquear una corrección de producto no relacionada.

## Interpretación del estado actual

- `npm run build` y `npm run typecheck` representan la salud de la app principal.
- `npm run lint:scripts` representa deuda y consistencia de utilitarios heredados.
- No mezcles ambos mundos al decidir si un cambio de producto está listo.

## Qué hacer cuando aparezcan muchos errores de golpe

1. Separa por carpeta.
2. Corrige primero errores reales en `src/`.
3. Mueve lo heredado de scripts a una lista de saneamiento incremental.
4. Nunca tapes una avalancha con suppressions globales.
