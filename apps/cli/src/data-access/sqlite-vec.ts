import type Database from "better-sqlite3";
import { existsSync } from "node:fs";
import sqliteVec from "sqlite-vec";

/**
 * 打包后 CLI 经 Electron 运行，sqlite-vec 从 app.asar 解析；SQLite 的 dlopen 不会被
 * Electron 重定向，必须改用 app.asar.unpacked 中的实体 dylib。
 */
export function loadSqliteVec(db: Database.Database): void {
  const loadablePath = sqliteVec.getLoadablePath();
  const unpackedPath = loadablePath.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
  db.loadExtension(
    unpackedPath !== loadablePath && existsSync(unpackedPath) ? unpackedPath : loadablePath
  );
}
