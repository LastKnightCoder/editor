import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  openSync,
  closeSync,
  readSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";

export interface SnapshotDatabase {
  prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  close(): void;
}
export type OpenSnapshotDatabase = (path: string) => SnapshotDatabase;

export function sessionDirectoryOf(databasePath: string): string {
  return join(dirname(databasePath), "sessions", basename(databasePath).replace(/\.db$/, ""));
}

const resolveFile = (dir: string, name: string) => {
  if (!name || name.startsWith(".") || /[\\/]/.test(name)) throw new Error("非法会话文件名");
  return join(dir, name);
};

/** 只读校验，不能用打开代理会话的方式升级或改写同步载荷。 */
export function validateSessionDirectory(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const entries = readFileSync(resolveFile(dir, name), "utf8")
      .split("\n")
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    if (!entries.length || entries[0]?.type !== "session" || typeof entries[0]?.id !== "string")
      throw new Error(`无效的会话文件：${name}`);
    if (entries.some(entry => !entry || typeof entry.type !== "string"))
      throw new Error(`无效的会话条目：${name}`);
  }
}

export function validateSessionReferences(
  databasePath: string,
  dir: string,
  openDatabase: OpenSnapshotDatabase
): void {
  validateDatabaseFile(databasePath, openDatabase);
  validateSessionDirectory(dir);
  const db = openDatabase(databasePath);
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='chat_session'").get()) return;
    const rows = db
      .prepare("SELECT session_file FROM chat_session WHERE message_count > 0")
      .all() as Array<{ session_file: string }>;
    for (const row of rows)
      if (!existsSync(resolveFile(dir, row.session_file)))
        throw new Error(`会话包缺少文件：${row.session_file}`);
  } finally {
    db.close();
  }
}

export function validateDatabaseFile(path: string, openDatabase: OpenSnapshotDatabase): void {
  const header = Buffer.alloc(100);
  const fd = openSync(path, "r");
  let count: number;
  try {
    count = readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  if (count < 100 || header.subarray(0, 16).toString() !== "SQLite format 3\u0000")
    throw new Error("下载内容不是有效数据库");
  const db = openDatabase(path);
  try {
    const check = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    if (check?.quick_check !== "ok") throw new Error("数据库完整性检查失败");
  } finally {
    db.close();
  }
}

export function packSessionDir(dir: string): Buffer {
  const zip = new AdmZip();
  if (existsSync(dir))
    for (const name of readdirSync(dir))
      if (name.endsWith(".jsonl")) zip.addLocalFile(resolveFile(dir, name));
  return zip.toBuffer();
}

export function replaceSessionDir(
  dir: string,
  archive: Buffer,
  backupRoot: string
): { backupPath?: string } {
  mkdirSync(backupRoot, { recursive: true });
  const stamp = randomUUID();
  const temp = join(backupRoot, `sessions-download-${stamp}.zip`);
  const backupPath = existsSync(dir)
    ? join(backupRoot, `${basename(dir)}-sessions-${stamp}`)
    : undefined;
  if (backupPath) renameSync(dir, backupPath);
  try {
    writeFileSync(temp, archive);
    mkdirSync(dir, { recursive: true });
    const entries = new AdmZip(temp).getEntries();
    const emptyZip = archive.length === 22 && archive.subarray(0, 4).toString("hex") === "504b0506";
    if (!entries.length && !emptyZip) throw new Error("会话包内容无法解析");
    const names = new Set<string>();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      const file = resolveFile(dir, name);
      if (!name.endsWith(".jsonl") || names.has(name))
        throw new Error("会话包包含不支持或重复的文件");
      names.add(name);
      writeFileSync(file, entry.getData());
    }
    return backupPath ? { backupPath } : {};
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    if (backupPath) renameSync(backupPath, dir);
    throw error;
  } finally {
    rmSync(temp, { force: true });
  }
}

interface DownloadJournal {
  databaseBackup: string;
  sessionDir: string;
  sessionsBackup: string;
  hadSessions: boolean;
  stage: string;
  replaceSessions?: boolean;
}

export function recoverSessionDownload(databasePath: string): void {
  const journal = `${databasePath}.session-sync.json`;
  if (!existsSync(journal)) return;
  const transaction = JSON.parse(readFileSync(journal, "utf8")) as DownloadJournal;
  copyFileSync(transaction.databaseBackup, databasePath);
  for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  if (transaction.replaceSessions !== false) {
    if (existsSync(transaction.sessionsBackup)) {
      rmSync(transaction.sessionDir, { recursive: true, force: true });
      renameSync(transaction.sessionsBackup, transaction.sessionDir);
    } else if (!transaction.hadSessions)
      rmSync(transaction.sessionDir, { recursive: true, force: true });
  }
  rmSync(transaction.stage, { recursive: true, force: true });
  rmSync(journal);
}

/** 调用方已关闭数据库并持有同步锁；支持旧数据库与新配对快照的同一提交/恢复链路。 */
export function installSessionDownload(
  databasePath: string,
  dir: string,
  archive: Buffer | undefined,
  openDatabase: OpenSnapshotDatabase
): void {
  recoverSessionDownload(databasePath);
  const stamp = randomUUID();
  const stage = `${dir}.download-${stamp}`;
  const databaseBackup = `${databasePath}.pre-session-sync-${stamp}.bak`;
  const sessionsBackup = `${dir}.pre-session-sync-${stamp}`;
  const journal = `${databasePath}.session-sync.json`;
  try {
    if (archive) replaceSessionDir(stage, archive, dirname(databaseBackup));
    validateSessionReferences(`${databasePath}.download.tmp`, archive ? stage : dir, openDatabase);
    copyFileSync(databasePath, databaseBackup);
    const hadSessions = existsSync(dir);
    writeFileSync(
      `${journal}.tmp`,
      JSON.stringify({
        databaseBackup,
        sessionDir: dir,
        sessionsBackup,
        hadSessions,
        stage,
        replaceSessions: Boolean(archive),
      }),
      { flag: "wx" }
    );
    renameSync(`${journal}.tmp`, journal);
    if (archive) {
      if (hadSessions) renameSync(dir, sessionsBackup);
      renameSync(stage, dir);
    }
    for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
    renameSync(`${databasePath}.download.tmp`, databasePath);
    rmSync(journal);
  } catch (error) {
    recoverSessionDownload(databasePath);
    throw error;
  } finally {
    rmSync(`${journal}.tmp`, { force: true });
    rmSync(stage, { recursive: true, force: true });
  }
}
