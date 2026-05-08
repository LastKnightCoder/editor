import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const APP_DIR = ".editor";

export function getAppDir(): string {
  return join(process.env.HOME || homedir(), APP_DIR);
}

export function getDbPath(name?: string): string {
  return join(getAppDir(), name ?? getActiveDbName());
}

export function getActiveDbName(): string {
  try {
    const content = readFileSync(join(getAppDir(), "setting.json"), "utf-8");
    const settings = JSON.parse(content);
    return settings.database?.active ?? "data.db";
  } catch {
    return "data.db";
  }
}
