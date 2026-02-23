import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import log from "electron-log";
import * as sqliteVec from "sqlite-vec";

const ASAR_PATH_MARK = "/app.asar/";
const ASAR_UNPACKED_PATH_MARK = "/app.asar.unpacked/";

const toUnpackedAsarPath = (loadablePath: string): string => {
  if (!loadablePath.includes(ASAR_PATH_MARK)) {
    return loadablePath;
  }
  return loadablePath.replace(ASAR_PATH_MARK, ASAR_UNPACKED_PATH_MARK);
};

export const loadSqliteVecExtension = (db: Database.Database): void => {
  const defaultLoadablePath = sqliteVec.getLoadablePath();
  const unpackedLoadablePath = toUnpackedAsarPath(defaultLoadablePath);
  const targetLoadablePath =
    unpackedLoadablePath !== defaultLoadablePath &&
    existsSync(unpackedLoadablePath)
      ? unpackedLoadablePath
      : defaultLoadablePath;

  if (targetLoadablePath !== defaultLoadablePath) {
    log.info(`[sqlite-vec-loader] use unpacked dylib: ${targetLoadablePath}`);
  }

  db.loadExtension(targetLoadablePath);
};
