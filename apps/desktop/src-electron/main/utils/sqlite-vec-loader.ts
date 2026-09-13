import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import log from "electron-log";
import * as sqliteVec from "sqlite-vec";
import { toUnpackedAsarPath } from "./asarPath";

export const loadSqliteVecExtension = (db: Database.Database): void => {
  const defaultLoadablePath = sqliteVec.getLoadablePath();
  const unpackedLoadablePath = toUnpackedAsarPath(defaultLoadablePath);
  const targetLoadablePath =
    unpackedLoadablePath !== defaultLoadablePath && existsSync(unpackedLoadablePath)
      ? unpackedLoadablePath
      : defaultLoadablePath;

  if (targetLoadablePath !== defaultLoadablePath) {
    log.info(`[sqlite-vec-loader] use unpacked dylib: ${targetLoadablePath}`);
  }

  db.loadExtension(targetLoadablePath);
};
