import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

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
