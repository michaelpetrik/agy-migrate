# Telemetry Proxy

## Goal

Ship public `npx agy-migrate` error diagnostics without requiring end users to configure PostHog environment variables and without embedding a PostHog project key in the npm package.

## Current State

The CLI currently sends sanitized error-only diagnostics directly to PostHog only when one of these environment variables is set:

- `AGY_MIGRATE_POSTHOG_KEY`
- `POSTHOG_API_KEY`

This is useful for local development and controlled testing, but it does not work for a random user running:

```sh
npx agy-migrate --apply
```

because their machine will not have those environment variables.

## Decision

Use a telemetry proxy.

The CLI should send sanitized error diagnostics to a project-owned HTTPS endpoint by default. The proxy owns the real PostHog project key server-side and forwards valid events to the self-hosted PostHog instance.

Do not embed a PostHog key in the CLI package.

## Proposed Runtime Flow

1. CLI catches a migration error.
2. CLI builds the existing sanitized `agy_migrate_error` payload.
3. CLI POSTs to the default proxy endpoint, for example:

   ```text
   https://telemetry.example.com/agy-migrate/error
   ```

4. Proxy validates the payload schema, rejects oversized or malformed requests, rate-limits by coarse IP/user-agent bucket, and forwards to self-hosted PostHog `/capture/`.
5. Proxy returns `204` or `200`; CLI ignores telemetry failures and preserves the original CLI error behavior.

## CLI Changes

- Add `AGY_MIGRATE_TELEMETRY_ENDPOINT` override.
- Keep `AGY_MIGRATE_TELEMETRY=0` and `--no-telemetry` opt-out.
- Keep direct PostHog env support only as a development fallback.
- Prefer proxy endpoint when configured as the public default.
- Do not send success events.
- Do not send raw paths, usernames, home directories, settings, snippets, extension metadata contents, tokens, or file contents.

## Proxy Requirements

- Holds the PostHog project key in server-side env only.
- Supports self-hosted PostHog via env, for example:

  ```sh
  POSTHOG_HOST=https://posthog.example.com
  POSTHOG_PROJECT_KEY=phc_xxx
  ```

- Accepts only the expected event name: `agy_migrate_error`.
- Enforces JSON body size limit.
- Validates required fields and drops unknown high-risk fields if needed.
- Applies rate limiting.
- Adds server-side fields such as proxy version and received timestamp.
- Never logs raw request bodies in production.

## Acceptance Criteria

- A clean machine can run `npx agy-migrate --apply`; sanitized error diagnostics are sent without any user `.env`.
- `npx agy-migrate --apply --no-telemetry` sends nothing.
- `AGY_MIGRATE_TELEMETRY=0 npx agy-migrate --apply` sends nothing.
- Telemetry failures never fail or slow the migration path beyond a short timeout.
- Unit tests cover endpoint selection and opt-out behavior.
- README explains proxy-backed diagnostics and the opt-out.

## Open Questions

- Hosting target: Cloudflare Worker, Vercel Function, or another existing service.
- Final public proxy URL.
- Self-hosted PostHog ingest URL.
- Retention and alerting policy for `agy_migrate_error` events.
