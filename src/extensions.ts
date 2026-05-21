import { constants as fsConstants, type Dirent } from "node:fs";
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type ExtensionRecord = {
  identifier?: {
    id?: string;
    uuid?: string;
  };
  version?: string;
  location?: Record<string, unknown>;
  relativeLocation?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ExtensionFolder = {
  name: string;
  sourcePath: string;
  targetPath: string;
};

export type ExtensionFsOps = {
  access(path: string, mode?: number): Promise<void>;
  cp(source: string, target: string, options: { recursive: true; force: boolean; errorOnExist: boolean }): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
};

export type ExtensionMigrationOptions = {
  sourceExtensions: string;
  targetExtensions: string;
  apply?: boolean;
  overwrite?: boolean;
  fs?: ExtensionFsOps;
  log?: (message: string) => void;
};

export type ExtensionMigrationResult = {
  foldersDiscovered: ExtensionFolder[];
  foldersCopied: ExtensionFolder[];
  foldersSkipped: ExtensionFolder[];
  recordsWritten: number;
};

export const nodeExtensionFsOps: ExtensionFsOps = {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(fs: ExtensionFsOps, path: string): Promise<boolean> {
  try {
    await fs.access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    const next = input[index + 1] ?? "";

    if (lineComment) {
      if (char === "\n" || char === "\r") {
        lineComment = false;
        output += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, "$1");
}

async function readExtensionRecords(fs: ExtensionFsOps, path: string): Promise<ExtensionRecord[]> {
  if (!(await exists(fs, path))) {
    return [];
  }

  const content = await fs.readFile(path, "utf8");
  if (content.trim() === "") {
    return [];
  }

  const parsed: unknown = JSON.parse(stripTrailingCommas(stripJsonComments(content)));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected extension records array: ${path}`);
  }

  return parsed.filter(isRecord) as ExtensionRecord[];
}

function cloneRecord(record: ExtensionRecord): ExtensionRecord {
  return JSON.parse(JSON.stringify(record)) as ExtensionRecord;
}

export function extensionIdFromFolder(folderName: string): string {
  const withoutPlatform = folderName.replace(
    /-(universal|darwin-arm64|darwin-x64|win32-x64|win32-arm64|linux-x64|linux-arm64)$/i,
    ""
  );

  return withoutPlatform.replace(/-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "");
}

function extensionKeys(record: ExtensionRecord): string[] {
  const keys = [
    record.identifier?.id,
    record.identifier?.uuid,
    record.relativeLocation
  ];

  return keys.filter((key): key is string => typeof key === "string" && key.length > 0);
}

function sourceRecordForFolder(sourceRecords: ExtensionRecord[], folderName: string): ExtensionRecord | undefined {
  const folderId = extensionIdFromFolder(folderName);

  return sourceRecords.find((record) => record.relativeLocation === folderName)
    ?? sourceRecords.find((record) => record.identifier?.id === folderId);
}

export function normalizeExtensionRecord(
  record: ExtensionRecord,
  folderName: string,
  targetPath: string
): ExtensionRecord {
  const next = cloneRecord(record);

  next.relativeLocation = folderName;
  next.location = {
    ...(isRecord(next.location) ? next.location : {}),
    path: targetPath,
    fsPath: targetPath,
    external: pathToFileURL(targetPath).href,
    scheme: "file"
  };

  next.identifier = {
    ...(next.identifier ?? {}),
    id: next.identifier?.id ?? extensionIdFromFolder(folderName)
  };

  return next;
}

export async function discoverSourceExtensionFolders(
  sourceExtensions: string,
  targetExtensions: string,
  fs: ExtensionFsOps = nodeExtensionFsOps
): Promise<ExtensionFolder[]> {
  if (!(await exists(fs, sourceExtensions))) {
    return [];
  }

  const sourceEntries = await fs.readdir(sourceExtensions, { withFileTypes: true });

  return sourceEntries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({
      name: entry.name,
      sourcePath: join(sourceExtensions, entry.name),
      targetPath: join(targetExtensions, entry.name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function copyExtensionFolders(
  folders: ExtensionFolder[],
  options: Required<Pick<ExtensionMigrationOptions, "apply" | "overwrite">> & {
    fs: ExtensionFsOps;
    log: (message: string) => void;
  }
): Promise<Pick<ExtensionMigrationResult, "foldersCopied" | "foldersSkipped">> {
  const foldersCopied: ExtensionFolder[] = [];
  const foldersSkipped: ExtensionFolder[] = [];

  for (const folder of folders) {
    const targetExists = await exists(options.fs, folder.targetPath);
    if (targetExists && !options.overwrite) {
      foldersSkipped.push(folder);
      options.log(`skip existing extension folder ${folder.targetPath}`);
      continue;
    }

    if (targetExists) {
      options.log(`remove existing extension folder ${folder.targetPath}`);
      if (options.apply) {
        await options.fs.rm(folder.targetPath, { recursive: true, force: true });
      }
    }

    foldersCopied.push(folder);
    options.log(`copy extension folder ${folder.sourcePath} -> ${folder.targetPath}`);
    if (options.apply) {
      await options.fs.cp(folder.sourcePath, folder.targetPath, {
        recursive: true,
        force: false,
        errorOnExist: true
      });
    }
  }

  return { foldersCopied, foldersSkipped };
}

export function mergeExtensionRecords(
  sourceRecords: ExtensionRecord[],
  targetRecords: ExtensionRecord[],
  folders: ExtensionFolder[],
  overwrite = false
): ExtensionRecord[] {
  const merged = targetRecords.map(cloneRecord);
  const indexByKey = new Map<string, number>();

  for (const [index, record] of merged.entries()) {
    for (const key of extensionKeys(record)) {
      indexByKey.set(key, index);
    }
  }

  for (const folder of folders) {
    const sourceRecord = sourceRecordForFolder(sourceRecords, folder.name) ?? {};
    const normalized = normalizeExtensionRecord(sourceRecord, folder.name, folder.targetPath);
    const matchingIndex = extensionKeys(normalized)
      .map((key) => indexByKey.get(key))
      .find((index): index is number => typeof index === "number");

    if (matchingIndex !== undefined) {
      if (!overwrite) {
        continue;
      }

      merged[matchingIndex] = normalized;
      for (const key of extensionKeys(normalized)) {
        indexByKey.set(key, matchingIndex);
      }
      continue;
    }

    const newIndex = merged.push(normalized) - 1;
    for (const key of extensionKeys(normalized)) {
      indexByKey.set(key, newIndex);
    }
  }

  return merged;
}

export async function migrateExtensions(options: ExtensionMigrationOptions): Promise<ExtensionMigrationResult> {
  const fs = options.fs ?? nodeExtensionFsOps;
  const apply = options.apply ?? false;
  const overwrite = options.overwrite ?? false;
  const log = options.log ?? (() => undefined);

  const foldersDiscovered = await discoverSourceExtensionFolders(
    options.sourceExtensions,
    options.targetExtensions,
    fs
  );

  if (foldersDiscovered.length === 0) {
    log(`skip missing or empty extension source ${options.sourceExtensions}`);
  }

  if (apply) {
    await fs.mkdir(options.targetExtensions, { recursive: true });
  }

  const { foldersCopied, foldersSkipped } = await copyExtensionFolders(foldersDiscovered, {
    apply,
    overwrite,
    fs,
    log
  });

  const sourceJsonPath = join(options.sourceExtensions, "extensions.json");
  const targetJsonPath = join(options.targetExtensions, "extensions.json");
  const sourceRecords = await readExtensionRecords(fs, sourceJsonPath);
  const targetRecords = await readExtensionRecords(fs, targetJsonPath);
  const mergedRecords = mergeExtensionRecords(sourceRecords, targetRecords, foldersDiscovered, overwrite);

  log(`merge extension metadata ${sourceJsonPath} -> ${targetJsonPath}`);
  if (apply) {
    await fs.mkdir(options.targetExtensions, { recursive: true });
    await fs.writeFile(targetJsonPath, `${JSON.stringify(mergedRecords, null, 2)}\n`, "utf8");
  }

  return {
    foldersDiscovered,
    foldersCopied,
    foldersSkipped,
    recordsWritten: mergedRecords.length
  };
}
