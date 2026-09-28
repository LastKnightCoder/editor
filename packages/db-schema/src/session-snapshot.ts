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
import { createHash, randomUUID } from "node:crypto";
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

const MANIFEST = "sessions-manifest.json";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
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

/** 只读校验，不能用打开代理会话的方式升级或改写同步载荷。 */
export function validateSessionDirectory(dir: string): Map<string, { id: string; users: number }> {
  const sessions = new Map<string, { id: string; users: number }>();
  if (!existsSync(dir)) return sessions;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const entries = readFileSync(resolveFile(dir, name), "utf8")
      .split("\n")
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    if (
      !entries.length ||
      entries[0]?.type !== "session" ||
      typeof entries[0]?.id !== "string" ||
      !entries[0].id ||
      entries[0].version !== 3
    )
      throw new Error(`无效的会话文件：${name}`);
    if (entries.some(entry => !entry || typeof entry.type !== "string"))
      throw new Error(`无效的会话条目：${name}`);
    const ids = new Set<string>();
    let users = 0;
    for (const entry of entries.slice(1)) {
      if (
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
    sessions.set(name, { id: entries[0].id, users });
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

export function packSessionDir(dir: string): Buffer {
  const zip = new AdmZip();
  validateSessionDirectory(dir);
  const files: Record<string, string> = {};
  if (existsSync(dir))
    for (const name of readdirSync(dir))
      if (name.endsWith(".jsonl")) {
        const data = readFileSync(resolveFile(dir, name));
        files[name] = digest(data);
        zip.addFile(name, data);
      }
  zip.addFile(MANIFEST, Buffer.from(JSON.stringify({ version: 1, files })));
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
    let manifest: { version: number; files: Record<string, string> } | undefined;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name === MANIFEST) {
        if (manifest) throw new Error("会话包包含重复清单");
        manifest = JSON.parse(entry.getData().toString("utf8"));
        continue;
      }
      const file = resolveFile(dir, name);
      if (!name.endsWith(".jsonl") || names.has(name))
        throw new Error("会话包包含不支持或重复的文件");
      names.add(name);
      writeFileSync(file, entry.getData());
    }
    if (manifest) {
      if (
        manifest.version !== 1 ||
        !manifest.files ||
        Object.keys(manifest.files).length !== names.size
      )
        throw new Error("会话包清单无效");
      for (const name of names)
        if (manifest.files[name] !== digest(readFileSync(resolveFile(dir, name))))
          throw new Error(`会话包完整性校验失败：${name}`);
    }
    validateSessionDirectory(dir);
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
