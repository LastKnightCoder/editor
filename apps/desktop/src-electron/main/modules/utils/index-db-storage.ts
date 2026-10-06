import { mkdirSync } from "node:fs";
import { join } from "node:path";
import PathUtil from "../../utils/PathUtil";

export const normalizeMainDbBase = (mainDbName: string): string => {
  return mainDbName.endsWith(".db") ? mainDbName.slice(0, -3) : mainDbName;
};

export const getIndexRootDir = (): string => {
  return join(PathUtil.getAppDir(), "index");
};

export const getIndexDbDir = (mainDbName: string): string => {
  return join(getIndexRootDir(), normalizeMainDbBase(mainDbName));
};

export const ensureIndexDbDir = (mainDbName: string): void => {
  mkdirSync(getIndexDbDir(mainDbName), { recursive: true });
};
