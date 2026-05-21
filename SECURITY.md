# Security Policy

## Supported Versions

Security fixes are handled on the latest published version.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security advisory for this repository. If advisories are unavailable, contact the repository maintainers directly and avoid posting exploit details in public issues.

Include:

- affected version or commit
- operating system
- command used
- source and target path shape, without secrets
- impact and reproduction steps

The CLI can read and copy local editor settings, extension metadata, snippets, and optional extension state. Do not include real tokens, credentials, private snippets, or full `globalStorage` contents in public reports.

## Handling Sensitive Local Data

Run without `--include-state` unless extension state migration is required. Some extension state folders may contain account identifiers, cache data, or credentials managed by the extension.

Always run the default dry run first, close Antigravity apps before `--apply`, and keep the generated backup files until the migrated IDE has been verified.
