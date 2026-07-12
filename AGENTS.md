# AGENTS.md

Compact, repo-specific rules for future OpenCode sessions.

## First reads (in order)
- `AI_README.md` (current project state and domain context)
- `TERMINAL_SAFETY.md` (local terminal safety policy)
- `package.json` (authoritative npm scripts)
- relevant SOP in `directives/` before building one-off flows
- for lint, TypeScript, suppression cleanup, or helper scripts: `directives/code_quality_guardrails.md`

## Stack and structure (verified)
- App is Next.js 16 + React 19 + TypeScript (`src/app` router, API routes in `src/app/api/**/route.ts`).
- Main code lives in `src/` with alias `@/* -> src/*` (`tsconfig.json`).
- Prisma is configured for local SQLite via `DATABASE_URL` in `prisma/schema.prisma`; `postinstall` runs `prisma generate`.
- Scripts/tooling TS is separated with `tsconfig.scripts.json` (includes `scripts/**/*.ts`, `execution/**/*.ts`).

## Commands agents should not guess
- Dev server (with print agent): `npm run dev` (uses concurrently; agent runs on port 3344)
- Build: `npm run build`
- Start prod server: `npm run start` (without print agent; for Vercel)
- Start prod server locally (with print agent): `npm run start:local`
- Lint: `npm run lint`
- Release helper (patch bump + push to fixed branch): `npm run release` (pushes to `origin Oswaldo_cambios`)

## Deployment target
- Production hosting is Vercel.
- Treat Vercel as the deployment source of truth for runtime behavior (env vars, build output, serverless constraints).
- Do not assume a CI workflow file exists in-repo; verify deploy behavior from Vercel/project settings when needed.

## Supabase source of truth
- Primary Supabase project for this repo is always `I+D`.
- Project ref/id: `nbifmxggfusipomspoly`.
- Project URL: `https://nbifmxggfusipomspoly.supabase.co`.
- Default all Supabase MCP migrations, SQL checks, RPC work, and schema inspections to this project unless the user explicitly says otherwise.
- Do not apply migrations, RPC changes, or data mutations to any other Supabase project from this workspace without explicit user confirmation in the same task.
- **Gobernanza estricta de nuevas tablas:** crear una tabla nueva en Supabase debe ser la última opción y solo se considera válido cuando sea supremamente necesario para cumplir la funcionalidad solicitada. Antes se deben evaluar y documentar alternativas más simples: reutilizar tablas existentes, columnas/JSONB ya disponibles, vistas, RPCs, relaciones existentes o lógica de aplicación. No crear tablas, funciones, triggers, vistas o índices por conveniencia, especulación o falta de inspección del esquema.
- Si una tabla nueva resulta realmente necesaria, el agente debe detenerse antes de aplicar el DDL y solicitar autorización explícita al usuario. La solicitud debe incluir: problema funcional que resuelve, por qué no sirven las estructuras existentes, alcance mínimo, impacto en datos y rendimiento, riesgos, plan de migración/reversión y cómo se verificará. La solicitud debe presentar la tabla completa y justificar cada campo (nombre, tipo, propósito, nulabilidad, valor por defecto, restricciones, relación, índice/RLS si aplica y ciclo de vida). Sin esa autorización explícita no se crea la tabla ni se ejecuta una migración que la incluya.

## Execution model used by this repo
- 3-layer workflow is intentional: directives in `directives/`, orchestration by agent, deterministic executors in `execution/`.
- Before writing new automation, check `execution/` and `scripts/` for an existing tool.
- Keep intermediates in `.tmp/` or `artifacts/`; do not treat them as product source files.

## Hard constraints to preserve
- **Collaborative safety (CRITICAL):** Before reverting, checking out, or touching any file, ALWAYS run `git diff --name-only` first. If a file has unstaged changes from BEFORE this session, LEAVE IT ALONE — those belong to another chat session. Never use `git checkout --` on files you did not personally create or modify in THIS session. Prefer surgical edits (`edit` tool) over bulk git reverts.
- Firplak DB rule: do not use legacy `cabinet_products` for business logic unless explicitly requested; prefer master catalog tables (`product_skus`, `product_versions`, `product_references`).
- **Secret hygiene (CRITICAL):** Never hardcode keys/tokens; use `.env`. **Never** read, print, echo, or output `.env` contents or any environment variable *values* in tool output or messages — this includes `Get-Content .env`, `cat .env`, `npm run env:print`, and similar. To check if a variable exists, test its presence (`$env:VAR_NAME` in PowerShell) without revealing the value.
- For major milestones, suggest running `/archive-session` to sync learnings into KIs and `AI_README.md`.

## Non-eludable code quality rules
- **Zero escape-by-suppression:** do not add `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, or broad `any` just to get past a failing task. Fix the cause or leave the case explicitly documented as pending and risky.
- **No fake green:** if `src/` changed, do not call the task ready without running `npm run lint`, `npm run typecheck`, and `npm run check:diff`. If behavior, routes, rendering, or APIs changed, also run `npm run build`.
- **Touched-file cleanup rule:** if you touch a file that already has suppressions, first try to remove at least one suppression in that same file before closing the task.
- **Prefer typed extraction over patching inline:** before considering suppression, try helper functions, shared types, narrowing utilities, parser helpers, DOM typing wrappers, or moving logic into a typed utility.
- **Prisma generated-client rule:** in `src/`, never import app models or `PrismaClient` from `@prisma/client`. This repo generates Prisma into `src/generated/prisma`, so app code must import types from `@/generated/prisma/client` and DB access through `@/lib/prisma`. If a form/view/RPC returns enriched fields, define a local composed type instead of pretending it is a pure Prisma model. Run `rg "@prisma/client" src --glob "!generated/**"` before deployment-sensitive changes.
- **Derived-state over effect-state:** when `react-hooks/set-state-in-effect` appears, prefer `useMemo`, lazy initial state, event-driven updates, reducer logic, or a small typed helper. Do not silence the rule by default.
- **UX-sensitive modules need minimal-surface changes:** `/generate`, `/templates/builder`, `/new`, `/assets`, filters, previews, and template persistence are high-risk. Do not mix large refactors with lint cleanup there.
- **Explain real impact plainly:** if a cleanup only changes internal timing or typing, say so explicitly. If it could change visible behavior, pause and explain before editing.
- **Legacy relocation rule:** when a module was already migrated (for example from `/products` to `/new`, `/configuration`, or `/mass-import`), do not create new bridges back to the old location.
- **Dead code is a separate job:** do not delete suspected dead code only because it looks old. First verify whether visible UI, routes, actions, or imports still call it.

## Programming style for this repo
- **Program by responsibility, not by urgency:** keep data parsing, business rules, UI rendering, and side effects separated. Do not bury everything inside one component or action.
- **Prefer small named helpers:** if a block needs explanation, it probably deserves extraction into a helper with a clear name instead of a large inline patch.
- **Keep comments scarce but useful:** comments should explain business intent, non-obvious constraints, migration context, or why something must stay a certain way. Do not add comments that merely narrate the syntax.
- **Name things by business meaning:** use names that reflect what the app does for the user, not just how the code happens to work.
- **Make state predictable:** avoid duplicated state when a value can be derived. Prefer one source of truth, especially in filters, previews, template selection, and form flows.
- **Prefer safe normalization layers:** when input can come from legacy JSON, DOM, query params, or external datasets, normalize it once in a typed helper instead of scattering defensive checks everywhere.
- **Leave files more legible than you found them:** if a file is touched, improve local structure a bit when safe: remove dead branches nearby, group related helpers, reduce nesting, and align naming.
- **Keep UI behavior stable while cleaning internals:** for sensitive screens, preserve the user flow first and improve structure second.

## Print agent rules
- **Never start/restart the agent or dev server.** The user controls that via `npm run dev`. If the agent needs a restart after code changes, say: "Cambios hechos. Reinicia el agente corriendo `npm run dev` (detenlo con Ctrl+C y vuelve a iniciarlo)."
- **Never start background processes** (Start-Process, cmd /c, etc.) to test code. Use `node -e` one-liners that run inline and return.
- **Never kill node processes** with taskkill. If orphaned agents exist on port 3344, ask the user to handle it.
