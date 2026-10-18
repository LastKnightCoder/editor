import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "./path.js";

export interface DatabaseConfig {
  name: string;
  version: number;
}

export interface Settings {
  database: {
    active: string;
    databases: DatabaseConfig[];
  };
  [key: string]: unknown;
}

const SETTINGS_FILE = "setting.json";

export function readSettings(): Settings {
  const content = readFileSync(join(getAppDir(), SETTINGS_FILE), "utf-8");
  return JSON.parse(content);
}

export function getActiveDatabase(): DatabaseConfig {
  const settings = readSettings();
  const active = settings.database.active ?? "data.db";
  const db = settings.database.databases.find(d => d.name === active);
  return db ?? { name: active, version: 0 };
}
