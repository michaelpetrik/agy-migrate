import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export type OperationMode = "dry-run" | "apply";

export type OperationAction =
  | "backup"
  | "copy"
  | "mkdir"
  | "remove"
  | "skip"
  | "validate";

export type OperationLogEntry = {
  mode: OperationMode;
  action: OperationAction;
  message: string;
  source?: string;
  target?: string;
};

export type OperationLogger = (entry: OperationLogEntry) => void;

export type FileOperationOptions = {
  apply: boolean;
  overwrite?: boolean;
  logger?: OperationLogger;
};

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function validateDirectory(
  path: string,
  options: { required?: boolean; logger?: OperationLogger } = {}
): Promise<void> {
  const pathExists = await exists(path);

  if (!pathExists) {
    if (options.required) {
      throw new Error(`Directory does not exist: ${path}`);
    }

    log(options.logger, false, {
      action: "validate",
      message: `directory does not exist yet: ${path}`,
      target: path
    });
    return;
  }

  const info = await stat(path);
  if (!info.isDirectory()) {
    throw new Error(`Expected directory: ${path}`);
  }

  log(options.logger, false, {
    action: "validate",
    message: `directory exists: ${path}`,
    target: path
  });
}

export async function backupPath(path: string, options: FileOperationOptions): Promise<string | undefined> {
  if (!(await exists(path))) {
    log(options.logger, options.apply, {
      action: "skip",
      message: `skip backup for missing path: ${path}`,
      source: path
    });
    return undefined;
  }

  const backup = `${path}.agy-migrator-backup-${timestamp()}`;
  log(options.logger, options.apply, {
    action: "backup",
    message: `backup ${path} -> ${backup}`,
    source: path,
    target: backup
  });

  if (options.apply) {
    await cp(path, backup, { recursive: true, force: false, errorOnExist: true });
  }

  return backup;
}

export async function copyFileOrDir(source: string, target: string, options: FileOperationOptions): Promise<void> {
  if (!(await exists(source))) {
    log(options.logger, options.apply, {
      action: "skip",
      message: `skip missing source: ${source}`,
      source,
      target
    });
    return;
  }

  const targetExists = await exists(target);
  if (targetExists && !options.overwrite) {
    log(options.logger, options.apply, {
      action: "skip",
      message: `skip existing target: ${target}`,
      source,
      target
    });
    return;
  }

  if (targetExists) {
    await backupPath(target, options);
    log(options.logger, options.apply, {
      action: "remove",
      message: `remove existing target: ${target}`,
      target
    });

    if (options.apply) {
      await rm(target, { recursive: true, force: true });
    }
  }

  await ensureParent(target, options);
  log(options.logger, options.apply, {
    action: "copy",
    message: `copy ${source} -> ${target}`,
    source,
    target
  });

  if (options.apply) {
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  }
}

export async function copyDirectoryContents(
  sourceDir: string,
  targetDir: string,
  options: FileOperationOptions
): Promise<void> {
  if (!(await exists(sourceDir))) {
    log(options.logger, options.apply, {
      action: "skip",
      message: `skip missing source directory: ${sourceDir}`,
      source: sourceDir,
      target: targetDir
    });
    return;
  }

  const sourceInfo = await stat(sourceDir);
  if (!sourceInfo.isDirectory()) {
    throw new Error(`Expected source directory: ${sourceDir}`);
  }

  if (await exists(targetDir)) {
    const targetInfo = await stat(targetDir);
    if (!targetInfo.isDirectory()) {
      if (!options.overwrite) {
        log(options.logger, options.apply, {
          action: "skip",
          message: `skip non-directory target: ${targetDir}`,
          source: sourceDir,
          target: targetDir
        });
        return;
      }

      await backupPath(targetDir, options);
      log(options.logger, options.apply, {
        action: "remove",
        message: `remove non-directory target: ${targetDir}`,
        target: targetDir
      });

      if (options.apply) {
        await rm(targetDir, { recursive: true, force: true });
      }
    }
  }

  log(options.logger, options.apply, {
    action: "mkdir",
    message: `ensure directory ${targetDir}`,
    target: targetDir
  });
  if (options.apply) {
    await mkdir(targetDir, { recursive: true });
  }

  for (const entry of await readdir(sourceDir)) {
    await copyFileOrDir(join(sourceDir, entry), join(targetDir, entry), options);
  }
}

async function ensureParent(path: string, options: FileOperationOptions): Promise<void> {
  const parent = dirname(path);
  log(options.logger, options.apply, {
    action: "mkdir",
    message: `ensure directory ${parent}`,
    target: parent
  });

  if (options.apply) {
    await mkdir(parent, { recursive: true });
  }
}

function log(
  logger: OperationLogger | undefined,
  apply: boolean,
  entry: Omit<OperationLogEntry, "mode">
): void {
  logger?.({
    mode: apply ? "apply" : "dry-run",
    ...entry
  });
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}
