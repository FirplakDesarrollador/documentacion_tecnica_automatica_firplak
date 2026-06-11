# Directiva: Code Quality Guardrails

Usa esta directiva cuando toques `src/`, `scripts/`, `execution/`, `print-agent/`, `prisma/` o cuando aparezcan errores de ESLint/TypeScript.

## Objetivo

Separar errores de producto, deuda historica y scripts auxiliares para que las correcciones no terminen en `eslint-disable` por cansancio o ruido operativo.

## Flujo base

1. Si cambias app/producto (`src/`, `next.config.ts`, `eslint.config.mjs`), corre:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build` si tocaste comportamiento, rutas, render, o APIs
2. Si cambias scripts auxiliares (`scripts/`, `execution/`, `print-agent/`, `prisma/`), corre:
   - `npm run lint:scripts`
3. Antes de cerrar la tarea, corre:
   - `npm run check:diff`

## Reglas

1. No agregues `eslint-disable`, `@ts-ignore` ni `@ts-nocheck` nuevos.
2. Si una correccion parece exigir suppressions, primero intenta una de estas salidas:
   - extraer tipos compartidos
   - usar `unknown` + narrowing
   - crear una declaracion `.d.ts` para extensiones del DOM o librerias
   - mover logica compleja a una funcion tipada
   - encapsular parsing legacy en un helper pequeño y reutilizable
3. Si tocas un archivo que ya tiene suppressions, intenta retirar al menos una en esa misma intervencion cuando sea razonable.
4. En `src/`, evita introducir `any` nuevo. Si no se puede resolver en la misma tarea, documenta por que quedo pendiente.
5. En `src/`, no importes modelos de app ni `PrismaClient` desde `@prisma/client`. Este repo usa el generador Prisma con salida en `src/generated/prisma`; por eso los tipos deben venir de `@/generated/prisma/client` y el acceso DB de `@/lib/prisma`. Si una vista, RPC, action o formulario agrega campos derivados, define un tipo compuesto/local antes de consumirlo. Valida con `rg "@prisma/client" src --glob "!generated/**"`.
6. En scripts auxiliares, trata `no-explicit-any` como deuda visible, no como razon para bloquear una correccion de producto no relacionada.
7. Si aparece `react-hooks/set-state-in-effect`, no lo silencies por defecto. Primero intenta una de estas salidas:
   - derivar el valor con `useMemo`
   - inicializar estado de forma perezosa
   - mover la actualizacion a un evento del usuario
   - extraer una funcion pura para normalizar datos antes de renderizar
   - diferir una sincronizacion visual minima solo si mantiene el mismo comportamiento real
8. Si el archivo tocado pertenece a flujos sensibles (`/generate`, `/templates/builder`, `/new`, `/assets`), no mezcles limpieza con refactor amplio. Cambia la menor superficie posible.
9. Si limpias un warning sin impacto funcional real, dilo explicitamente al cerrar. Si puede cambiar UX, deten la edicion y explica antes.

## Estilo de programacion esperado

1. Separa parsing, reglas de negocio, render, y efectos secundarios. No entierres todo en un solo componente o accion.
2. Prefiere helpers pequeños con nombre claro sobre bloques inline largos.
3. Usa comentarios solo para explicar restricciones del negocio, compatibilidad legacy o decisiones no obvias.
4. Prefiere una sola fuente de verdad. Si un valor se puede derivar, no lo dupliques en estado.
5. Normaliza entrada legacy o externa en una capa tipada antes de consumirla.
6. Si tocas un archivo grande, mejora legibilidad local cuando sea seguro:
   - agrupa helpers relacionados
   - reduce nesting
   - alinea nombres
   - elimina ramas muertas cercanas ya confirmadas

## Interpretacion del estado actual

- `npm run build` y `npm run typecheck` representan la salud de la app principal.
- `npm run lint:scripts` representa deuda y consistencia de utilitarios heredados.
- No mezcles ambos mundos al decidir si un cambio de producto esta listo.

## Que hacer cuando aparezcan muchos errores de golpe

1. Separa por carpeta.
2. Corrige primero errores reales en `src/`.
3. Mueve lo heredado de scripts a una lista de saneamiento incremental.
4. Nunca tapes una avalancha con suppressions globales.
