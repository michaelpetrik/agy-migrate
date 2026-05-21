import { createHash, randomUUID } from "node:crypto";
import { homedir, hostname, platform, release, type } from "node:os";
import { basename, dirname, sep } from "node:path";

export type TelemetryConfig = {
  enabled: boolean;
  apiKey?: string;
  host: string;
  distinctId: string;
  packageVersion: string;
};

export type ErrorTelemetryContext = {
  command: string;
  phase: string;
  apply: boolean;
  overwrite: boolean;
  includeState: boolean;
  sourceAppSupport?: string;
  targetAppSupport?: string;
  sourceExtensions?: string;
  targetExtensions?: string;
};

type Env = Partial<NodeJS.ProcessEnv>;

const disabledValues = new Set(["0", "false", "off", "no"]);

export function createTelemetryConfig(options: {
  env?: Env;
  telemetryEnabled: boolean;
  packageVersion: string;
}): TelemetryConfig {
  const env = options.env ?? process.env;
  const apiKey = env.AGY_MIGRATE_POSTHOG_KEY ?? env.POSTHOG_API_KEY;
  const host = env.AGY_MIGRATE_POSTHOG_HOST ?? env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  const envDisabled = disabledValues.has((env.AGY_MIGRATE_TELEMETRY ?? "").toLowerCase());
  const enabled = options.telemetryEnabled && !envDisabled && Boolean(apiKey);

  return {
    enabled,
    apiKey,
    host: host.replace(/\/+$/, ""),
    distinctId: anonymousDistinctId(env),
    packageVersion: options.packageVersion
  };
}

export async function captureErrorTelemetry(
  config: TelemetryConfig,
  error: unknown,
  context: ErrorTelemetryContext
): Promise<void> {
  if (!config.enabled || !config.apiKey) {
    return;
  }

  const sanitized = sanitizeError(error);
  const payload = {
    api_key: config.apiKey,
    event: "agy_migrate_error",
    distinct_id: config.distinctId,
    properties: {
      package_version: config.packageVersion,
      command: context.command,
      phase: context.phase,
      apply: context.apply,
      overwrite: context.overwrite,
      include_state: context.includeState,
      platform: platform(),
      os_type: type(),
      os_release_major: release().split(".")[0] ?? "unknown",
      node_major: process.versions.node.split(".")[0] ?? "unknown",
      error_name: sanitized.name,
      error_message: sanitized.message,
      error_stack: sanitized.stack,
      error_fingerprint: sanitized.fingerprint,
      source_app_support_shape: pathShape(context.sourceAppSupport),
      target_app_support_shape: pathShape(context.targetAppSupport),
      source_extensions_shape: pathShape(context.sourceExtensions),
      target_extensions_shape: pathShape(context.targetExtensions),
      telemetry_schema: 1
    }
  };

  try {
    const response = await fetch(`${config.host}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    await response.arrayBuffer();
  } catch {
    // Telemetry must never affect migration behavior.
  }
}

export function sanitizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  fingerprint: string;
} {
  const name = error instanceof Error ? error.name : "NonError";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const rawStack = error instanceof Error ? error.stack : undefined;
  const message = sanitizeText(rawMessage);
  const stack = rawStack ? sanitizeText(rawStack).split("\n").slice(0, 12).join("\n") : undefined;
  const fingerprint = hashStable(`${name}\n${message}\n${stack ?? ""}`).slice(0, 16);

  return { name, message, stack, fingerprint };
}

export function sanitizeText(value: string): string {
  let text = value;
  const home = homedir();

  if (home) {
    text = text.split(home).join("<home>");
  }

  text = text
    .replace(/\/Users\/[^/\s)]+/g, "/Users/<user>")
    .replace(/\/home\/[^/\s)]+/g, "/home/<user>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s)]+/g, "C:\\Users\\<user>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/phc_[A-Za-z0-9_-]+/g, "phc_<redacted>")
    .replace(/(token|key|secret|password)=([^&\s]+)/gi, "$1=<redacted>");

  return text;
}

export function pathShape(path: string | undefined): Record<string, unknown> | undefined {
  if (!path) {
    return undefined;
  }

  const normalized = sanitizeText(path).replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const leaf = parts.at(-1) ?? "";

  return {
    depth: parts.length,
    leaf_kind: classifyLeaf(leaf),
    parent_kind: classifyLeaf(basename(dirname(normalized))),
    has_antigravity: /antigravity/i.test(normalized),
    hash: hashStable(normalized).slice(0, 12)
  };
}

function classifyLeaf(value: string): string {
  if (!value) {
    return "empty";
  }

  if (/^<.+>$/.test(value)) {
    return "redacted";
  }

  if (/antigravity ide/i.test(value)) {
    return "antigravity-ide";
  }

  if (/antigravity/i.test(value)) {
    return "antigravity";
  }

  if (value === "extensions") {
    return "extensions";
  }

  if (value.includes(".")) {
    return "dot-name";
  }

  return "name";
}

function anonymousDistinctId(env: Env): string {
  const seed = env.AGY_MIGRATE_DISTINCT_ID
    ?? `${hostname()}${sep}${process.execPath}${sep}${process.version}`;
  return `anon_${hashStable(seed).slice(0, 24)}`;
}

function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
