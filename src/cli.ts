import { resolve } from "node:path";

export type Options = {
  apply: boolean;
  overwrite: boolean;
  includeState: boolean;
  telemetry: boolean;
  sourceAppSupport: string;
  targetAppSupport: string;
  sourceExtensions: string;
  targetExtensions: string;
  help: boolean;
};

type PathOption =
  | "sourceAppSupport"
  | "targetAppSupport"
  | "sourceExtensions"
  | "targetExtensions";

const pathFlags = new Map<string, PathOption>([
  ["--source", "sourceAppSupport"],
  ["--target", "targetAppSupport"],
  ["--source-ext", "sourceExtensions"],
  ["--target-ext", "targetExtensions"]
]);

const helpText = `agy-migrate

Migrate old Antigravity setup into Antigravity IDE.

Usage:
  agy-migrate [--dry-run]
  agy-migrate --apply [--overwrite] [--include-state]
  agy-migrate --help

Flags:
  --dry-run             Preview actions. Default.
  --apply               Write changes.
  --overwrite           Replace conflicting target files/directories.
  --include-state       Copy globalStorage extension folders too.
  --no-telemetry        Disable sanitized error diagnostics for this run.
  --source <path>       Old Antigravity app support directory.
  --target <path>       New Antigravity IDE app support directory.
  --source-ext <path>   Old extension directory.
  --target-ext <path>   New extension directory.
  -h, --help            Show this help text.
`;

export function parseArgs(argv: readonly string[], defaults: Options): Options {
  const options: Options = { ...defaults, help: defaults.help ?? false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg) {
      continue;
    }

    const [flag, inlineValue] = splitInlineValue(arg);
    const pathOption = pathFlags.get(flag);

    if (pathOption) {
      const [value, nextIndex] = readFlagValue(flag, inlineValue, argv, index);
      options[pathOption] = resolve(value);
      index = nextIndex;
      continue;
    }

    switch (flag) {
      case "--apply":
        rejectInlineValue(flag, inlineValue);
        options.apply = true;
        break;
      case "--dry-run":
        rejectInlineValue(flag, inlineValue);
        options.apply = false;
        break;
      case "--overwrite":
        rejectInlineValue(flag, inlineValue);
        options.overwrite = true;
        break;
      case "--include-state":
        rejectInlineValue(flag, inlineValue);
        options.includeState = true;
        break;
      case "--no-telemetry":
        rejectInlineValue(flag, inlineValue);
        options.telemetry = false;
        break;
      case "--help":
      case "-h":
        rejectInlineValue(flag, inlineValue);
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function printHelpText(): string {
  return helpText;
}

function splitInlineValue(arg: string): [flag: string, value: string | undefined] {
  const equalsIndex = arg.indexOf("=");

  if (equalsIndex === -1) {
    return [arg, undefined];
  }

  return [arg.slice(0, equalsIndex), arg.slice(equalsIndex + 1)];
}

function readFlagValue(
  flag: string,
  inlineValue: string | undefined,
  argv: readonly string[],
  index: number
): [value: string, nextIndex: number] {
  if (inlineValue !== undefined) {
    if (inlineValue === "") {
      throw new Error(`Missing value for ${flag}`);
    }

    return [inlineValue, index];
  }

  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return [value, index + 1];
}

function rejectInlineValue(flag: string, value: string | undefined): void {
  if (value !== undefined) {
    throw new Error(`${flag} does not accept a value`);
  }
}
