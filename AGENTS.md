# AGENTS.md

Compact, repo-specific rules for future OpenCode sessions.

## First reads (in order)
- `AI_README.md` (current project state and domain context)
- `TERMINAL_SAFETY.md` (local terminal safety policy)
- `package.json` (authoritative npm scripts)
- relevant SOP in `directives/` before building one-off flows

## Stack and structure (verified)
- App is Next.js 16 + React 19 + TypeScript (`src/app` router, API routes in `src/app/api/**/route.ts`).
- Main code lives in `src/` with alias `@/* -> src/*` (`tsconfig.json`).
- Prisma is configured for local SQLite via `DATABASE_URL` in `prisma/schema.prisma`; `postinstall` runs `prisma generate`.
- Scripts/tooling TS is separated with `tsconfig.scripts.json` (includes `scripts/**/*.ts`, `execution/**/*.ts`).

## Commands agents should not guess
- Dev server: `npm run dev`
- Build: `npm run build`
- Start prod server: `npm run start`
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

## Execution model used by this repo
- 3-layer workflow is intentional: directives in `directives/`, orchestration by agent, deterministic executors in `execution/`.
- Before writing new automation, check `execution/` and `scripts/` for an existing tool.
- Keep intermediates in `.tmp/` or `artifacts/`; do not treat them as product source files.

## Hard constraints to preserve
- Collaborative safety: do not edit/revert/rename files outside agreed scope, especially when unrelated diffs exist.
- Firplak DB rule: do not use legacy `cabinet_products` for business logic unless explicitly requested; prefer master catalog tables (`product_skus`, `product_versions`, `product_references`).
- Secret hygiene: never hardcode keys/tokens; use `.env`.
- For major milestones, suggest running `/archive-session` to sync learnings into KIs and `AI_README.md`.
