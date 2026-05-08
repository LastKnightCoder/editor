import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "./path.js";

export interface DatabaseConfig {
  name: string;
  version: number;
}

export interface SyncProviderConfig {
  active: string;
  aliOSS: {
    bucket: string;
    region: string;
    path: string;
    accessKeyId?: string;
    accessKeySecret?: string;
  };
  s3: { bucket: string; region: string; pathPrefix: string };
  webdav: { pathPrefix: string };
  github: { repo: string; branch: string; pathPrefix: string };
}

export interface IntegrationConfig {
  aliOSS: { accessKeyId: string; accessKeySecret: string };
  s3: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
    urlStyle: string;
  };
  webdav: { url: string; username: string; password: string };
  github: { token: string; user: { name: string; email: string } };
}

export interface Settings {
  database: {
    active: string;
    databases: DatabaseConfig[];
  };
  sync: SyncProviderConfig;
  integration: IntegrationConfig;
  [key: string]: unknown;
}

const SETTINGS_FILE = "setting.json";

export function readSettings(): Settings {
  const content = readFileSync(join(getAppDir(), SETTINGS_FILE), "utf-8");
  return JSON.parse(content);
}

export function writeSettings(settings: Settings): void {
  const path = join(getAppDir(), SETTINGS_FILE);
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}

export function getActiveDatabase(): DatabaseConfig {
  const settings = readSettings();
  const active = settings.database.active ?? "data.db";
  const db = settings.database.databases.find((d) => d.name === active);
  return db ?? { name: active, version: 0 };
}

export function getSyncConfig(): {
  provider: string;
  providerConfig: Record<string, unknown>;
  credentials: Record<string, unknown>;
} {
  const settings = readSettings();
  const provider = settings.sync.active;

  switch (provider) {
    case "aliOSS":
      return {
        provider,
        providerConfig: settings.sync.aliOSS,
        credentials: settings.integration.aliOSS,
      };
    case "s3":
      return {
        provider,
        providerConfig: settings.sync.s3,
        credentials: settings.integration.s3,
      };
    case "webdav":
      return {
        provider,
        providerConfig: settings.sync.webdav,
        credentials: settings.integration.webdav,
      };
    case "github":
      return {
        provider,
        providerConfig: settings.sync.github,
        credentials: settings.integration.github,
      };
    default:
      return { provider: "none", providerConfig: {}, credentials: {} };
  }
}

export function updateDatabaseVersion(
  dbName: string,
  newVersion: number,
): void {
  const settings = readSettings();
  const db = settings.database.databases.find((d) => d.name === dbName);
  if (db) {
    db.version = newVersion;
    writeSettings(settings);
  }
}
