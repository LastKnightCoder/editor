import cacheSchema from "@tau/db-schema/schema/collaboration.sql?raw";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import type { CollaborationSession } from "@tau/collaboration";

export class CollaborationLocalStore {
  readonly db: Database.Database;
  readonly failures = new Map<string, string>();
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new Database(join(directory, "collaboration.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    const version = Number(this.db.pragma("user_version", { simple: true }));
    if (version > 3) {
      this.db.close();
      throw new Error("本地协作缓存版本较新，请升级 Tau");
    }
    const existing = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get();
    if (existing && version !== 3) {
      this.db.close();
      throw new Error("CONTENT_FORMAT_UNSUPPORTED: 本机协作缓存格式不受支持");
    }
    this.db.transaction(() => {
      this.db.exec(cacheSchema);
      this.db.pragma("user_version=3");
    })();
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as T) : fallback;
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
  identityEntries(): [string, string][] {
    return (
      this.db.prepare("SELECT key,value FROM settings WHERE key LIKE 'identity:%'").all() as {
        key: string;
        value: string;
      }[]
    ).map(row => [row.key.slice("identity:".length), JSON.parse(row.value) as string]);
  }
  list() {
    this.failures.clear();
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
        this.failures.set(row.id, "协作缓存元数据不可读，原数据已保留");
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
