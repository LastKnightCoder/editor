import {
  copyFileSync,
  existsSync,
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

const ENTRY_TYPES = new Set([
  "message",
  "thinking_level_change",
  "model_change",
  "usage",
  "compaction",
  "branch_summary",
  "custom",
  "custom_message",
  "context_edit",
  "label",
  "session_info",
]);

function* sessionEntries(file: string): Generator<Record<string, any>> {
  const fd = openSync(file, "r");
  const buffer = Buffer.alloc(64 * 1024);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  try {
    while (true) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      pending += count
        ? decoder.decode(buffer.subarray(0, count), { stream: true })
        : decoder.decode();
      let index: number;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        if (line.trim()) yield JSON.parse(line);
      }
      if (!count) {
        if (pending.trim()) yield JSON.parse(pending);
        return;
      }
    }
  } finally {
    closeSync(fd);
  }
}

/** 只读校验，不能用打开代理会话的方式升级或改写同步载荷。 */
export function validateSessionDirectory(dir: string): Map<string, { id: string; users: number }> {
  const sessions = new Map<string, { id: string; users: number }>();
  if (!existsSync(dir)) return sessions;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const entries = sessionEntries(resolveFile(dir, name));
    const header = entries.next();
    if (
      header.done ||
      !header.value ||
      header.value.type !== "session" ||
      typeof header.value.id !== "string" ||
      !header.value.id ||
      header.value.version !== 3
    ) {
      entries.return(undefined);
      throw new Error(`无效的会话文件：${name}`);
    }
    const ids = new Set<string>();
    let users = 0;
    for (const entry of entries) {
      if (
        !entry ||
        !ENTRY_TYPES.has(entry.type) ||
        typeof entry.id !== "string" ||
        !entry.id ||
        ids.has(entry.id) ||
        (entry.parentId !== null && !ids.has(entry.parentId))
      )
        throw new Error(`会话树存在重复、缺失或循环引用：${name}`);
      for (const key of ["targetId", "firstKeptEntryId", "fromId"]) {
        if (entry[key] !== undefined && !ids.has(entry[key]))
          throw new Error(`会话条目引用不存在：${name}`);
      }
      if (entry.type === "message") {
        if (
          !entry.message ||
          !["user", "assistant", "toolResult", "system"].includes(entry.message.role) ||
          !(typeof entry.message.content === "string" || Array.isArray(entry.message.content))
        )
          throw new Error(`无效的会话消息：${name}`);
        if (entry.message.role === "user") users += 1;
      }
      ids.add(entry.id);
    }
    sessions.set(name, { id: header.value.id, users });
  }
  return sessions;
}

export function validateSessionReferences(
  databasePath: string,
  dir: string,
  openDatabase: OpenSnapshotDatabase
): void {
  validateDatabaseFile(databasePath, openDatabase);
  const sessions = validateSessionDirectory(dir);
  const db = openDatabase(databasePath);
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='chat_session'").get()) return;
    const rows = db
      .prepare("SELECT id, session_file, message_count FROM chat_session")
      .all() as Array<{ id: string; session_file: string; message_count: number }>;
    for (const row of rows) {
      resolveFile(dir, row.session_file);
      const session = sessions.get(row.session_file);
      if (!session && row.message_count > 0) throw new Error(`会话包缺少文件：${row.session_file}`);
      if (session && (session.id !== row.id || session.users < row.message_count))
        throw new Error(`会话内容与目录身份不一致：${row.session_file}`);
    }
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

/** 已关闭数据库并持有同步锁时，目录和数据库共同提交与恢复。 */
export function installSessionDownload(
  databasePath: string,
  dir: string,
  downloadedDirectory: string | undefined,
  openDatabase: OpenSnapshotDatabase
): void {
  recoverSessionDownload(databasePath);
  const stamp = randomUUID();
  const stage = downloadedDirectory ?? `${dir}.download-${stamp}`;
  const databaseBackup = `${databasePath}.pre-session-sync-${stamp}.bak`;
  const sessionsBackup = `${dir}.pre-session-sync-${stamp}`;
  const journal = `${databasePath}.session-sync.json`;
  try {
    if (downloadedDirectory && !existsSync(stage)) throw new Error("会话下载目录缺失");
    validateSessionReferences(
      `${databasePath}.download.tmp`,
      downloadedDirectory ? stage : dir,
      openDatabase
    );
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
        replaceSessions: Boolean(downloadedDirectory),
      }),
      { flag: "wx" }
    );
    renameSync(`${journal}.tmp`, journal);
    if (downloadedDirectory) {
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
