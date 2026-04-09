import { mkdirSync } from "node:fs";
import { join } from "node:path";
import PathUtil from "../../utils/PathUtil";

export const normalizeMainDbBase = (mainDbName: string): string => {
  return mainDbName.endsWith(".db") ? mainDbName.slice(0, -3) : mainDbName;
};

export const getMemoryRootDir = (): string => {
  return join(PathUtil.getAppDir(), "memory");
};

export const getMemoryDbDir = (mainDbName: string): string => {
  return join(getMemoryRootDir(), normalizeMainDbBase(mainDbName));
};

export const getMemoryPalacePath = (mainDbName: string): string => {
  return join(getMemoryDbDir(mainDbName), "palace");
};

export const getMemoryStateDbPath = (mainDbName: string): string => {
  return join(getMemoryDbDir(mainDbName), "state.sqlite3");
};

export const getMemoryManifestPath = (mainDbName: string): string => {
  return join(getMemoryDbDir(mainDbName), "manifest.json");
};

export const getMemoryStagingDir = (mainDbName: string): string => {
  return join(getMemoryDbDir(mainDbName), "staging");
};

export const ensureMemoryDbDir = (mainDbName: string): string => {
  const dir = getMemoryDbDir(mainDbName);
  mkdirSync(dir, { recursive: true });
  mkdirSync(getMemoryPalacePath(mainDbName), { recursive: true });
  mkdirSync(getMemoryStagingDir(mainDbName), { recursive: true });
  return dir;
};
