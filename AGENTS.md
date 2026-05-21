# Agent Instructions

This repository contains a small Node/TypeScript CLI for migrating Antigravity setup data into Antigravity IDE.

## Working Rules

- Do not edit generated or dependency content in `node_modules/`.
- Keep CLI behavior conservative: dry run by default, explicit `--apply` for writes, and backups before destructive replacement.
- Treat user settings, snippets, extension metadata, and `globalStorage` as potentially sensitive local data.
- Prefer small, direct changes over broad refactors.
- Keep README usage aligned with the actual CLI flags.
- If changing the public command name, update README, `package.json` `name`, `bin`, package lock metadata, and any help text together.

## Verification

Run these checks after code changes:

```sh
npm run check
npm run build
node dist/index.js --help
node dist/index.js --dry-run
```

For documentation-only changes, at minimum review the touched Markdown files and confirm that any published commands match package metadata or clearly document pending metadata work.
