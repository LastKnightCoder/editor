import cacheSchema from "@tau/db-schema/schema/collaboration.sql?raw";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import type { CollaborationSession } from "@tau/collaboration";

export class CollaborationLocalStore {
  readonly db: Database.Database;
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, "collaboration.db");
    this.db = new Database(path);
    const version = Number(this.db.pragma("user_version", { simple: true }));
    const existing = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get();
    if (existing && version !== 3) this.db = this.rebuild(path, version);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.transaction(() => {
      this.db.exec(cacheSchema);
      this.db.pragma("user_version=3");
    })();
  }
  /**
   * 缓存文件不是当前格式（含较新版本写入）：整份移入 discarded/ 后新建，不阻断协作。
   * settings 里有设备身份与共享绑定，能读出的键值迁进新库；正文缓存随后按服务器或主库重建。
   */
  private rebuild(path: string, version: number): Database.Database {
    let settings: { key: string; value: string }[] = [];
    try {
      settings = this.db.prepare("SELECT key,value FROM settings").all() as typeof settings;
    } catch {
      // 读不出的 settings 随原文件一起备份
    }
    this.db.close();
    const discarded = join(this.directory, "discarded");
    mkdirSync(discarded, { recursive: true, mode: 0o700 });
    const stamp = `${Date.now()}-version-${version}`;
    for (const suffix of ["", "-wal", "-shm"])
      if (existsSync(path + suffix))
        renameSync(path + suffix, join(discarded, `${stamp}-collaboration.db${suffix}`));
    const db = new Database(path);
    db.exec(cacheSchema);
    const insert = db.prepare("INSERT OR IGNORE INTO settings VALUES (?,?)");
    db.transaction(() => {
      for (const row of settings)
        if (typeof row.key === "string" && typeof row.value === "string")
          insert.run(row.key, row.value);
    })();
    return db;
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
      | { value: string }
      | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      // 坏值备份后按缺省处理，不让读取方整体失败
      const discarded = join(this.directory, "discarded");
      mkdirSync(discarded, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(discarded, `${Date.now()}-setting-${digest(Buffer.from(key)).slice(0, 16)}.json`),
        JSON.stringify({ key, value: row.value }),
        { mode: 0o600 }
      );
      this.delete(key);
      return fallback;
    }
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      )
      .run(key, JSON.stringify(value));
  }
  delete(key: string) {
    this.db.prepare("DELETE FROM settings WHERE key=?").run(key);
  }
  /** 元数据不可读的缓存行备份后丢弃，不阻断其他会话。 */
  list() {
    return (
      this.db.prepare("SELECT id,metadata FROM sessions").all() as {
        id: string;
        metadata: string;
      }[]
    ).flatMap(row => {
      try {
        const value = JSON.parse(row.metadata) as CollaborationSession;
        if (!value || value.id !== row.id) throw new Error("会话身份不匹配");
        return [value];
      } catch {
        this.discard(row.id, "协作缓存元数据不可读");
        return [];
      }
    });
  }
  load(id: string): {
    doc: Y.Doc;
    info: CollaborationSession;
  } {
    const row = this.db
      .prepare("SELECT state,state_hash,metadata FROM sessions WHERE id=?")
      .get(id) as { state: Buffer; state_hash: string | null; metadata: string } | undefined;
    if (!row) throw new Error("协作内容本地缓存不存在");
    const doc = new Y.Doc({ gc: false });
    try {
      if (row.state_hash && row.state_hash !== digest(row.state))
        throw new Error("协作缓存快照摘要不匹配");
      Y.applyUpdate(doc, row.state);
      for (const update of this.db
        .prepare("SELECT state,hash FROM updates WHERE document_id=? ORDER BY id")
        .all(id) as { state: Buffer; hash: string | null }[]) {
        if (update.hash && update.hash !== digest(update.state))
          throw new Error("协作缓存增量摘要不匹配");
        Y.applyUpdate(doc, update.state);
      }
      const info = JSON.parse(row.metadata) as CollaborationSession;
      if (info.id !== id) throw new Error("协作缓存元数据身份不匹配");
      return { doc, info };
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }
  create(session: CollaborationSession, doc: Y.Doc) {
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    this.db
      .prepare(
        "INSERT INTO sessions(id,metadata,state,state_hash) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata"
      )
      .run(session.id, JSON.stringify(session), state, digest(state));
  }
  metadata(session: CollaborationSession) {
    this.db
      .prepare("UPDATE sessions SET metadata=? WHERE id=?")
      .run(JSON.stringify(session), session.id);
  }
  append(id: string, update: Uint8Array) {
    if (!this.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id))
      throw new Error("协作缓存会话已失效，尚未保存编辑");
    this.db
      .prepare("INSERT OR IGNORE INTO updates(document_id,state,hash) VALUES (?,?,?)")
      .run(id, Buffer.from(update), digest(update));
  }
  compact(id: string, doc: Y.Doc) {
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    this.db.transaction(() => {
      const result = this.db
        .prepare("UPDATE sessions SET state=?,state_hash=? WHERE id=?")
        .run(state, digest(state), id);
      if (result.changes !== 1) throw new Error("协作缓存会话已失效，不能清理增量");
      this.db.prepare("DELETE FROM updates WHERE document_id=?").run(id);
    })();
  }
  /**
   * 无法恢复的缓存：原始快照与增量写入 discarded/ 备份后删除，
   * 调用方随后按远端或主库重建，坏缓存不让功能停摆。
   */
  discard(id: string, reason: string) {
    const row = this.db.prepare("SELECT metadata,state FROM sessions WHERE id=?").get(id) as
      | { metadata: string; state: Buffer }
      | undefined;
    if (!row) return;
    const updates = this.db
      .prepare("SELECT state FROM updates WHERE document_id=? ORDER BY id")
      .all(id) as { state: Buffer }[];
    const directory = join(this.directory, "discarded");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(directory, `${Date.now()}-${digest(Buffer.from(id)).slice(0, 16)}.json`),
      JSON.stringify({
        id,
        reason,
        metadata: row.metadata,
        state: row.state.toString("base64"),
        updates: updates.map(update => update.state.toString("base64")),
      }),
      { mode: 0o600 }
    );
    this.remove(id);
  }
  remove(id: string) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM updates WHERE document_id=?").run(id);
      this.db.prepare("DELETE FROM sessions WHERE id=?").run(id);
      this.db.prepare("DELETE FROM resources WHERE document_id=?").run(id);
      this.db.prepare("DELETE FROM settings WHERE key=?").run(`invitation:${id}`);
    })();
  }
}

const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
