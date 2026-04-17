---
name: project-context-keeper
description: Manage and maintain the `AI_README.md` file, which serves as the primary source of truth for AI agents working on the Firplak project. Use this skill to record major architectural changes, dependency updates, new features, or shifts in domain logic. It allows adding, modifying, and removing strategic information to keep the context relevant and concise.
---

# Project Context Keeper 🧠

This skill ensures that every AI agent working on the Firplak project is immediately aware of the most important context, rules, and architectural decisions.

## When to use
- After implementing a new major feature or module.
- When changing a core business rule (e.g., how translations are handled).
- When adding or removing critical dependencies.
- Before a `/release` to summarize the current state of the repo for the next agent.

## How to use
Use the provided Python script `scripts/update_ai_readme.py` to interact with the `AI_README.md` file in the root directory.

### Commands:
1. **Add new context**: `python scripts/update_ai_readme.py --add "Section Title" --content "Strategic information here"`
2. **Update existing section**: `python scripts/update_ai_readme.py --update "Section Title" --content "New refined information"`
3. **Remove obsolete info**: `python scripts/update_ai_readme.py --remove "Section Title"`

## Strategy for Information
- **Conciseness**: Only keep what's truly "key". Avoid verbose logs (use git for that).
- **Strategic Value**: Focus on "Why" and "How" for an AI agent (e.g., "Use 이 module instead of 그 module because...").
- **Self-Cleaning**: If a piece of information is now default behavior or well-known, consider removing it to reduce context noise.
