# GitHub Integration Directive

This directive defines the SOP for interacting with GitHub within the 3-layer architecture.

## Goal
Enable the system to list repositories and fetch document contents from GitHub to automate technical documentation.

## Inputs
- `GITHUB_TOKEN`: Personal Access Token with `repo` scope (loaded from `.env`).
- `GITHUB_USER`: The username or organization to target.

## Execution Tools
- `execution/github_operations.py`: The deterministic script for API calls.

## Standard Operations

### 1. List User Repositories
Use this to discover available repositories for the user.
**Command:**
```bash
python execution/github_operations.py --list-repos
```

### 2. Fetch File Content
Use this to retrieve the source code or documentation files.
**Command:**
```bash
python execution/github_operations.py --repo "owner/repo" --file "path/to/file"
```

## Edge Cases & Handling
- **Rate Limiting**: If the API returns a 403, check the remaining quota.
- **Unauthorized**: Ensure the PAT is valid and hasn't expired.
- **File Not Found**: Confirm the path is relative to the repository root.
