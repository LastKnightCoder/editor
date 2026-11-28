import type Database from "better-sqlite3";
import log from "electron-log";
import * as sqliteVec from "sqlite-vec";
import { sqliteVecExtensionPath } from "./sqlite-vec-path";

// 每个数据库连接都会加载一次扩展，同一路径每次运行只记一条
const announcedPaths = new Set<string>();

export const loadSqliteVecExtension = (db: Database.Database): void => {
  const defaultLoadablePath = sqliteVec.getLoadablePath();
  const targetLoadablePath = sqliteVecExtensionPath();
  if (targetLoadablePath !== defaultLoadablePath && !announcedPaths.has(targetLoadablePath)) {
    announcedPaths.add(targetLoadablePath);
    log.info(`[sqlite-vec-loader] use unpacked dylib: ${targetLoadablePath}`);
  }

  db.loadExtension(targetLoadablePath);
};
