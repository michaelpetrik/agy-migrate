import { homedir, platform as currentPlatform } from "node:os";
import { join } from "node:path";

export type SupportedPlatform = "darwin" | "win32" | "linux";
export type RuntimePlatform = SupportedPlatform | NodeJS.Platform;

export type PlatformEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "APPDATA" | "HOME" | "LOCALAPPDATA" | "USERPROFILE" | "XDG_CONFIG_HOME" | "XDG_DATA_HOME">
>;

export type PlatformOptions = {
  env?: PlatformEnvironment;
  homeDir?: string;
  platform?: RuntimePlatform;
};

export type ProductPathDefaults = {
  appSupportDir: string;
  extensionsDir: string;
};

export type AntigravityPathDefaults = {
  antigravity: ProductPathDefaults;
  antigravityIde: ProductPathDefaults;
};

const antigravityAppName = "Antigravity";
const antigravityIdeAppName = "Antigravity IDE";

const antigravityExtensionsDirName = ".antigravity";
const antigravityIdeExtensionsDirName = ".antigravity-ide";

function getPlatform(options: PlatformOptions): RuntimePlatform {
  return options.platform ?? currentPlatform();
}

function getHomeDir(options: PlatformOptions): string {
  return options.homeDir ?? homedir();
}

function getEnv(options: PlatformOptions): PlatformEnvironment {
  return options.env ?? process.env;
}

function defaultAppSupportDir(appName: string, options: PlatformOptions = {}): string {
  const env = getEnv(options);
  const home = getHomeDir(options);

  switch (getPlatform(options)) {
    case "darwin":
      return join(home, "Library", "Application Support", appName);
    case "win32":
      return join(env.APPDATA ?? join(home, "AppData", "Roaming"), appName);
    default:
      return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), appName);
  }
}

function defaultExtensionsDir(dirName: string, options: PlatformOptions = {}): string {
  const env = getEnv(options);
  const home = getHomeDir(options);

  if (getPlatform(options) === "win32") {
    return join(env.USERPROFILE ?? home, dirName, "extensions");
  }

  return join(home, dirName, "extensions");
}

export function getAntigravityAppSupportDir(options: PlatformOptions = {}): string {
  return defaultAppSupportDir(antigravityAppName, options);
}

export function getAntigravityIdeAppSupportDir(options: PlatformOptions = {}): string {
  return defaultAppSupportDir(antigravityIdeAppName, options);
}

export function getAntigravityExtensionsDir(options: PlatformOptions = {}): string {
  return defaultExtensionsDir(antigravityExtensionsDirName, options);
}

export function getAntigravityIdeExtensionsDir(options: PlatformOptions = {}): string {
  return defaultExtensionsDir(antigravityIdeExtensionsDirName, options);
}

export function getAntigravityPathDefaults(options: PlatformOptions = {}): AntigravityPathDefaults {
  return {
    antigravity: {
      appSupportDir: getAntigravityAppSupportDir(options),
      extensionsDir: getAntigravityExtensionsDir(options)
    },
    antigravityIde: {
      appSupportDir: getAntigravityIdeAppSupportDir(options),
      extensionsDir: getAntigravityIdeExtensionsDir(options)
    }
  };
}
