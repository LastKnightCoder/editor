import Database from "better-sqlite3";
import { ensureMainSchema } from "./main-schema";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

/** 只在候选文件上升级、校验，成功后才允许替换当前库。 */
export function prepareDatabaseDownload(path: string) {
  const db = new Database(path, { fileMustExist: true });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cards'").get())
      throw new Error("下载文件不是 Tau 资料库");
    ensureMainSchema(db);
    if (db.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("下载的资料库未通过完整性检查");
    if (db.pragma("wal_checkpoint(TRUNCATE)", { simple: true }) !== 0)
      throw new Error("待安装资料库仍在使用");
  } finally {
    db.close();
  }
}

/** 数据库已关闭且持有同步锁时安装候选文件；有云端会话目录时一并替换。 */
export function installDatabaseDownload(
  databasePath: string,
  downloadPath: string,
  sessionDir: string,
  downloadedSessions?: string
): void {
  for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  renameSync(downloadPath, databasePath);
  if (downloadedSessions) {
    mkdirSync(dirname(sessionDir), { recursive: true });
    rmSync(sessionDir, { recursive: true, force: true });
    renameSync(downloadedSessions, sessionDir);
  }
}
