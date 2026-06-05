# Execution Tools

This directory keeps only deterministic operational utilities that still support
current repo workflows.

Current keepers:
- `bulk_associate_isometrics.ts`: mass association flow referenced by `directives/bulk_isometrics_import.md`
- `github_operations.py`: GitHub API helper referenced by `directives/github_integration.md`
- `version_bump.py`: release helper referenced by `.agents/workflows/release.md`
- `sync_mcp_config.js`: syncs MCP credentials from `.env`, referenced by `AI_README.md`
- `search_product_references.ts`: read-only lookup for current catalog data
- `inspect_product_reference.ts`: read-only reference inspection
- `inspect_product_version.ts`: read-only version inspection
- `normalize_line_endings.mjs`: generic text normalization helper

Support files:
- `requirements.txt`: Python dependencies for the GitHub and release helpers

Rule of thumb:
- Keep files here only if they serve an active workflow, SOP, or recurring
  operational task.
- One-off migrations, audits, smoke tests, and historical fix scripts should be
  deleted after they have served their purpose.
