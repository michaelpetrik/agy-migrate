import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { parseArgs } from "../dist/cli.js";
import { extensionIdFromFolder } from "../dist/extensions.js";
import { parseJsonWithComments } from "../dist/jsonc.js";
import {
  getAntigravityAppSupportDir,
  getAntigravityExtensionsDir,
  getAntigravityIdeAppSupportDir,
  getAntigravityIdeExtensionsDir
} from "../dist/platform.js";
import { mergeSettings } from "../dist/settings.js";

const defaults = {
  apply: false,
  overwrite: false,
  includeState: false,
  telemetry: true,
  sourceAppSupport: "/default/source-app",
  targetAppSupport: "/default/target-app",
  sourceExtensions: "/default/source-ext",
  targetExtensions: "/default/target-ext",
  help: false
};

test("parses flags, inline path values, and separate path values", () => {
  assert.deepEqual(
    parseArgs([
      "--apply",
      "--overwrite",
      "--include-state",
      "--source=source app",
      "--target",
      "target app",
      "--source-ext=source extensions",
      "--target-ext",
      "target extensions"
    ], defaults),
    {
      apply: true,
      overwrite: true,
      includeState: true,
      sourceAppSupport: resolve("source app"),
      targetAppSupport: resolve("target app"),
      sourceExtensions: resolve("source extensions"),
      targetExtensions: resolve("target extensions"),
      telemetry: true,
      help: false
    }
  );

  assert.equal(parseArgs(["--apply", "--dry-run"], defaults).apply, false);
  assert.equal(parseArgs(["--no-telemetry"], defaults).telemetry, false);
  assert.equal(parseArgs(["-h"], defaults).help, true);
});

test("rejects missing arg values, unexpected values, and unknown flags", () => {
  assert.throws(() => parseArgs(["--source"], defaults), /Missing value for --source/);
  assert.throws(() => parseArgs(["--target="], defaults), /Missing value for --target/);
  assert.throws(() => parseArgs(["--apply=true"], defaults), /--apply does not accept a value/);
  assert.throws(() => parseArgs(["--nope"], defaults), /Unknown argument: --nope/);
});

test("parses JSONC comments and trailing commas without altering string URLs", () => {
  const parsed = parseJsonWithComments(`{
    // comments are removed
    "url": "https://example.test/path//still-string",
    "nested": {
      /* block comments are removed */
      "enabled": true,
    },
    "items": [
      "one",
      "two",
    ],
  }`);

  assert.deepEqual(parsed, {
    url: "https://example.test/path//still-string",
    nested: { enabled: true },
    items: ["one", "two"]
  });
});

test("merges settings recursively with target values taking precedence", () => {
  assert.deepEqual(
    mergeSettings(
      {
        "editor.fontSize": 14,
        nested: {
          sourceOnly: true,
          shared: "source"
        },
        arrayValue: [1, 2]
      },
      {
        "editor.fontSize": 16,
        nested: {
          shared: "target"
        },
        targetOnly: "yes"
      }
    ),
    {
      "editor.fontSize": 16,
      nested: {
        sourceOnly: true,
        shared: "target"
      },
      arrayValue: [1, 2],
      targetOnly: "yes"
    }
  );

  assert.equal(mergeSettings(undefined, "target"), "target");
  assert.equal(mergeSettings("source", undefined), "source");
});

test("returns platform-specific Antigravity defaults", () => {
  assert.equal(
    getAntigravityAppSupportDir({ homeDir: "/Users/alex", platform: "darwin" }),
    "/Users/alex/Library/Application Support/Antigravity"
  );
  assert.equal(
    getAntigravityIdeAppSupportDir({
      env: { APPDATA: "C:\\Users\\alex\\AppData\\Roaming" },
      homeDir: "C:\\Users\\alex",
      platform: "win32"
    }),
    "C:\\Users\\alex\\AppData\\Roaming/Antigravity IDE"
  );
  assert.equal(
    getAntigravityAppSupportDir({
      env: { XDG_CONFIG_HOME: "/home/alex/.config-alt" },
      homeDir: "/home/alex",
      platform: "linux"
    }),
    "/home/alex/.config-alt/Antigravity"
  );
  assert.equal(
    getAntigravityExtensionsDir({ homeDir: "/Users/alex", platform: "darwin" }),
    "/Users/alex/.antigravity/extensions"
  );
  assert.equal(
    getAntigravityIdeExtensionsDir({
      env: { USERPROFILE: "C:\\Users\\alex" },
      homeDir: "C:\\fallback",
      platform: "win32"
    }),
    "C:\\Users\\alex/.antigravity-ide/extensions"
  );
});

test("derives extension identifiers from versioned platform folders", () => {
  assert.equal(extensionIdFromFolder("publisher.theme-1.2.3-darwin-arm64"), "publisher.theme");
  assert.equal(extensionIdFromFolder("publisher.tool-2.0.0-beta.1"), "publisher.tool");
  assert.equal(extensionIdFromFolder("publisher.anything-3.4.5-universal"), "publisher.anything");
  assert.equal(extensionIdFromFolder("publisher.unversioned"), "publisher.unversioned");
});

test("keeps npx publish entry points wired to built output", async () => {
  const packageJson = JSON.parse(await readFile(join(resolve("."), "package.json"), "utf8"));

  assert.equal(packageJson.name, "agy-migrate");
  assert.equal(packageJson.bin["agy-migrate"], "./dist/index.js");
  assert.ok(packageJson.files.includes("dist"));
  assert.ok(packageJson.files.includes("README.md"));
});
