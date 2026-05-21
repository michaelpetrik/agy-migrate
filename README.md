# agy-migrate

Migrate an existing Antigravity VS Code-style setup into Antigravity IDE.

Shortest practical command after the npm package is published:

```sh
npx agy-migrate
```

The default run is a dry run. It prints the planned file operations and does not write anything.

## What It Migrates

- `User/settings.json`, merged so existing target settings win on conflicts
- `User/keybindings.json`
- `User/snippets`
- installed extension directories
- `extensions.json` extension metadata
- optional extension state folders under `User/globalStorage`

## Usage

Preview the migration:

```sh
npx agy-migrate
```

Apply the migration:

```sh
npx agy-migrate --apply
```

Apply and include extension state:

```sh
npx agy-migrate --apply --include-state
```

Sanitized error diagnostics are sent only when a PostHog project key is configured:

```sh
AGY_MIGRATE_POSTHOG_KEY=phc_xxx npx agy-migrate --apply
```

Use custom paths:

```sh
npx agy-migrate --source "/path/to/Antigravity" --target "/path/to/Antigravity IDE"
```

Local development command before publishing:

```sh
npm install
npm run build
node dist/index.js
```

## Options

```text
--dry-run             Preview actions. Default.
--apply               Write changes.
--overwrite           Replace conflicting target files/directories after creating backups.
--include-state       Copy globalStorage extension folders too.
--no-telemetry        Disable sanitized error diagnostics for this run.
--source <path>       Old Antigravity app support directory.
--target <path>       New Antigravity IDE app support directory.
--source-ext <path>   Old extension directory.
--target-ext <path>   New extension directory.
-h, --help            Show CLI help.
```

## Safety

Run the dry run first and inspect the planned operations. Close Antigravity and Antigravity IDE before using `--apply`.

Existing target files are skipped unless `--overwrite` is set. When the tool overwrites or merges a target file, it first creates a timestamped backup beside that target using the suffix `.agy-migrator-backup-<timestamp>`.

Use `--include-state` only when you want extension runtime state copied as well. State can include extension-specific caches, tokens, or local data, depending on the extension.

## Error Diagnostics

`agy-migrate` can send error-only diagnostics to PostHog when `AGY_MIGRATE_POSTHOG_KEY` or `POSTHOG_API_KEY` is set. No successful migration events are sent.

For public `npx agy-migrate` usage, the planned production design is a telemetry proxy so users do not need local PostHog environment variables and the package does not embed a PostHog key. See [tasks/telemetry-proxy.md](tasks/telemetry-proxy.md).

The payload is designed for failure detection, not user tracking. It includes the CLI version, OS family, Node major version, command flags, sanitized error name/message/stack, deterministic error fingerprint, and redacted path shapes. It does not send raw source paths, target paths, usernames, home directories, snippets, settings, extension metadata contents, tokens, or file contents.

Environment variables:

```sh
AGY_MIGRATE_POSTHOG_KEY=phc_xxx
AGY_MIGRATE_POSTHOG_HOST=https://us.i.posthog.com
AGY_MIGRATE_TELEMETRY=0
```

Use `https://eu.i.posthog.com` for an EU PostHog project, or set your self-hosted PostHog URL. You can also disable diagnostics per command:

```sh
npx agy-migrate --apply --no-telemetry
```

## macOS And Windows Notes

Default macOS app support paths are under `~/Library/Application Support`, with extensions under `~/.antigravity/extensions` and `~/.antigravity-ide/extensions`.

Default Windows app support paths are under `%APPDATA%`, with extensions under `%USERPROFILE%\.antigravity\extensions` and `%USERPROFILE%\.antigravity-ide\extensions`.

Use quoted paths when a path contains spaces, especially for `Antigravity IDE`.

## Build And Publish Notes

This repository currently builds a TypeScript CLI with:

```sh
npm run build
npm run check
```

Before public npm publishing, verify the package contents:

```sh
npm pack --dry-run
```

Publish only after `dist/` is current, the README matches the package metadata, and the repository has a license and security policy.
