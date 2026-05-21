import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Options as MigrationOptions } from "./cli.js";
import type { OperationLogEntry } from "./fs-ops.js";
import { backupPath, copyDirectoryContents, copyFileOrDir, exists, validateDirectory } from "./fs-ops.js";
import { migrateExtensions } from "./extensions.js";
import { parseJsonWithComments, stringifyJsonWithComments } from "./jsonc.js";
import { getAntigravityPathDefaults } from "./platform.js";
import { mergeSettings } from "./settings.js";

const userConfigFiles = [
  "keybindings.json",
  "tasks.json",
  "argv.json"
];

const stateDirs = [
  "User/globalStorage"
];

export type MigrationPlan = {
  apply: boolean;
  overwrite: boolean;
  includeState: boolean;
  sourceAppSupport: string;
  targetAppSupport: string;
  sourceExtensions: string;
  targetExtensions: string;
};

export function createDefaultOptions(): MigrationOptions {
  const defaults = getAntigravityPathDefaults();

  return {
    apply: false,
    overwrite: false,
    includeState: false,
    telemetry: true,
    sourceAppSupport: defaults.antigravity.appSupportDir,
    targetAppSupport: defaults.antigravityIde.appSupportDir,
    sourceExtensions: defaults.antigravity.extensionsDir,
    targetExtensions: defaults.antigravityIde.extensionsDir,
    help: false
  };
}

export function createMigrationPlan(options: MigrationOptions): MigrationPlan {
  const defaults = getAntigravityPathDefaults();

  return {
    apply: options.apply ?? false,
    overwrite: options.overwrite ?? false,
    includeState: options.includeState ?? false,
    sourceAppSupport: options.sourceAppSupport ?? defaults.antigravity.appSupportDir,
    targetAppSupport: options.targetAppSupport ?? defaults.antigravityIde.appSupportDir,
    sourceExtensions: options.sourceExtensions ?? defaults.antigravity.extensionsDir,
    targetExtensions: options.targetExtensions ?? defaults.antigravityIde.extensionsDir
  };
}

export async function runMigration(options: MigrationOptions): Promise<void> {
  const plan = createMigrationPlan(options);

  await validateMigrationInput(plan);
  printMigrationPlan(plan);

  if (plan.apply) {
    console.log("Close Antigravity and Antigravity IDE before applying this migration.");
    console.log("");
  }

  await migrateSettings(plan);
  await migrateUserFiles(plan);
  await migrateExtensions({
    ...plan,
    log: (message) => logPlan(plan, message)
  });
  await migrateState(plan);

  console.log("");
  console.log(plan.apply ? "Migration finished." : "Dry run finished. Re-run with --apply to write changes.");
}

async function validateMigrationInput(plan: MigrationPlan): Promise<void> {
  await Promise.all([
    validateDirectory(plan.sourceAppSupport, { required: true, logger: logOperation }),
    validateDirectory(plan.targetAppSupport, { logger: logOperation }),
    validateDirectory(plan.sourceExtensions, { required: true, logger: logOperation }),
    validateDirectory(plan.targetExtensions, { logger: logOperation })
  ]);
}

function printMigrationPlan(plan: MigrationPlan): void {
  console.log(`source app support: ${plan.sourceAppSupport}`);
  console.log(`target app support: ${plan.targetAppSupport}`);
  console.log(`source extensions:  ${plan.sourceExtensions}`);
  console.log(`target extensions:  ${plan.targetExtensions}`);
  console.log("");
}

async function migrateSettings(plan: MigrationPlan): Promise<void> {
  const source = join(plan.sourceAppSupport, "User", "settings.json");
  const target = join(plan.targetAppSupport, "User", "settings.json");

  if (!(await exists(source))) {
    logPlan(plan, `skip missing ${source}`);
    return;
  }

  const sourceSettings = await readJson(source, {});
  const targetSettings = await readJson(target, {});
  const merged = mergeSettings(sourceSettings, targetSettings);

  await backupPath(target, withOperationLogging(plan));
  logPlan(plan, `merge settings ${source} -> ${target}`);

  if (plan.apply) {
    await mkdir(join(plan.targetAppSupport, "User"), { recursive: true });
    await writeFile(target, stringifyJsonWithComments(merged), "utf8");
  }
}

async function migrateUserFiles(plan: MigrationPlan): Promise<void> {
  for (const file of userConfigFiles) {
    await copyFileOrDir(
      join(plan.sourceAppSupport, "User", file),
      join(plan.targetAppSupport, "User", file),
      withOperationLogging(plan)
    );
  }

  await copyDirectoryContents(
    join(plan.sourceAppSupport, "User", "snippets"),
    join(plan.targetAppSupport, "User", "snippets"),
    withOperationLogging(plan)
  );
}

async function migrateState(plan: MigrationPlan): Promise<void> {
  if (!plan.includeState) {
    console.log(`${plan.apply ? "apply" : "dry-run"}: skip globalStorage state; pass --include-state to copy extension state folders`);
    return;
  }

  for (const dir of stateDirs) {
    await copyDirectoryContents(
      join(plan.sourceAppSupport, dir),
      join(plan.targetAppSupport, dir),
      withOperationLogging(plan)
    );
  }
}

async function readJson(path: string, fallback: unknown): Promise<unknown> {
  if (!(await exists(path))) {
    return fallback;
  }

  const content = await readFile(path, "utf8");
  if (content.trim() === "") {
    return fallback;
  }

  return parseJsonWithComments(content);
}

function withOperationLogging(plan: MigrationPlan): MigrationPlan & { logger: typeof logOperation } {
  return {
    ...plan,
    logger: logOperation
  };
}

function logOperation(entry: OperationLogEntry): void {
  console.log(`${entry.mode}: ${entry.message}`);
}

function logPlan(plan: MigrationPlan, message: string): void {
  console.log(`${plan.apply ? "apply" : "dry-run"}: ${message}`);
}
