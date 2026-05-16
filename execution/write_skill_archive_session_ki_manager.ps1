$ErrorActionPreference = "Stop"

$skillDir = "C:\Users\oswaldo.rivera\.codex\skills\archive-session-ki-manager"
if (!(Test-Path $skillDir)) {
  throw "Skill directory not found: $skillDir"
}

$skill = @'
---
name: archive-session-ki-manager
description: Create or update Knowledge Items (KIs) from chat/session context using the /archive-session workflow. Use when the user asks to archive a session, capture decisions/bugs/flows as durable project memory, or when new learnings should be added to existing KIs under .gemini/antigravity/knowledge/.
---

# Archive Session: KI Manager

Turn chat history into durable, structured project memory by creating or updating Knowledge Items (KIs) under `.gemini/antigravity/knowledge/`.

## Workflow (use this every time)

1. Identify what changed in this session.
- Closed decisions ("we will do X")
- New invariants/governance rules
- New bugs + root cause + fix
- New scripts/RPCs/migrations and why they exist
- New operational runbooks (how to run it, how to validate)

2. Decide: update an existing KI vs create a new KI.
- Update if the topic already exists and this session adds clarity, edge cases, or fixes.
- Create new if this introduces a distinct workflow/module/system.

3. Choose the KI format (follow what exists in the repo).
- If the KI folder uses `metadata.json` + `artifacts/knowledge_item.md`, continue that format.
- If the KI is a single `KI.md`, continue that format.

4. Apply edits carefully.
- Do not duplicate content across KIs.
- Prefer concrete facts: exact table/RPC/function names, file paths, and rules.
- Add "Why" for non-obvious decisions.
- Call out risks and future gotchas.

5. Keep it actionable.
- Include verification steps, commands/scripts, and the exact UI route(s).

## Create a new KI (template)

When creating a new KI folder:
- Create folder: `.gemini/antigravity/knowledge/<slug>/`
- Add `metadata.json` (minimal): `title`, `tags`, `created_at`, `updated_at`
- Add `artifacts/knowledge_item.md` with sections:
  - Contexto / Problema
  - Decisiones clave (cerradas)
  - Estado final (qué quedó funcional)
  - Flujos (UI/API/RPC)
  - Datos/Esquema (tablas/columnas/riesgos)
  - Operación (cómo correr, cómo validar)
  - Edge cases / No hacer

If the project uses a standalone KI file instead, create `KI.md` with the same sections.

## Update an existing KI (rules)

- Keep the original intent and structure.
- Prefer appending new subsections over rewriting large blocks.
- If the existing KI is wrong/outdated, correct it and add a short note like "Actualizado en YYYY-MM".

## Quality bar

- No secrets in KIs.
- No legacy tables for business logic unless explicitly allowed (avoid `cabinet_products`).
- Use exact paths/names as they exist.
- Avoid speculation: if something is uncertain, write it as an open question.
'@

Set-Content -LiteralPath (Join-Path $skillDir "SKILL.md") -Value $skill -Encoding UTF8

New-Item -ItemType Directory -Force -Path (Join-Path $skillDir "agents") | Out-Null

$openaiYaml = @'
version: 1

name: archive-session-ki-manager

display_name: Archive Session: KI Manager

short_description: Crea/actualiza KIs desde el chat

default_prompt: |
  Usa el flujo /archive-session para crear o actualizar KIs en .gemini/antigravity/knowledge/.
  - Propón KIs nuevos cuando haya decisiones/bugs/flows nuevos.
  - Actualiza KIs existentes sin duplicar contenido.
  - Incluye rutas de archivos, tablas/RPCs/migraciones, decisiones cerradas, riesgos y pasos de verificación.
'@

Set-Content -LiteralPath (Join-Path (Join-Path $skillDir "agents") "openai.yaml") -Value $openaiYaml -Encoding UTF8

Write-Host "Wrote skill files OK"
