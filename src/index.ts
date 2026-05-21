#!/usr/bin/env node
import { parseArgs, printHelpText } from "./cli.js";
import { createDefaultOptions, createMigrationPlan, runMigration } from "./migrator.js";
import { captureErrorTelemetry, createTelemetryConfig } from "./telemetry.js";

const packageVersion = "0.1.0";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), createDefaultOptions());

  if (options.help) {
    console.log(printHelpText());
    return;
  }

  try {
    await runMigration(options);
  } catch (error) {
    const plan = createMigrationPlan(options);
    await captureErrorTelemetry(
      createTelemetryConfig({
        telemetryEnabled: options.telemetry,
        packageVersion
      }),
      error,
      {
        command: process.argv.slice(2).join(" "),
        phase: "migration",
        apply: plan.apply,
        overwrite: plan.overwrite,
        includeState: plan.includeState,
        sourceAppSupport: plan.sourceAppSupport,
        targetAppSupport: plan.targetAppSupport,
        sourceExtensions: plan.sourceExtensions,
        targetExtensions: plan.targetExtensions
      }
    );

    const message = error instanceof Error ? error.message : String(error);
    console.error(`agy-migrate: ${message}`);
    process.exitCode = 1;
  }
}

main();
