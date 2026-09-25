import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import { randomUUID } from "node:crypto";
import type { CollaborationSession, ContentNode } from "@tau/collaboration";
import { retireEditorBlocksInDoc } from "@tau/collaboration";

export class CollaborationLocalStore {
  readonly db: Database.Database;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new Database(join(directory, "collaboration.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    const version = Number(this.db.pragma("user_version", { simple: true }));
    if (version > 1) {
      this.db.close();
      throw new Error("本地协作缓存版本较新，请升级 Tau");
    }
    this.db.transaction(() => {
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, state BLOB NOT NULL, private_nodes TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, state BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS updates_document ON updates(document_id);
      CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, path TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version = 1;
    `);
    })();
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
      { value: string } | undefined;
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
  backupBeforeKnowledgeMigration(databaseName: string) {
    const key = `knowledge-migration-backup:${databaseName}`;
    if (this.get(key, "")) return;
    const path = `${this.db.name}.pre-knowledge-v1-${randomUUID()}.bak`;
    this.db.prepare("VACUUM INTO ?").run(path);
    this.set(key, path);
  }
  list() {
    return (
      this.db.prepare("SELECT metadata FROM sessions").all() as {
        metadata: string;
      }[]
    ).map(row => JSON.parse(row.metadata) as CollaborationSession);
  }
  load(id: string): { doc: Y.Doc; privateNodes: Map<string, ContentNode> } {
    const row = this.db.prepare("SELECT state,private_nodes FROM sessions WHERE id=?").get(id) as
      { state: Buffer; private_nodes: string } | undefined;
    if (!row) throw new Error("协作内容本地缓存不存在");
    const doc = new Y.Doc();
    Y.applyUpdate(doc, row.state);
    for (const update of this.db
      .prepare("SELECT state FROM updates WHERE document_id=? ORDER BY id")
      .all(id) as { state: Buffer }[])
      Y.applyUpdate(doc, update.state);
    const privateNodes = new Map<string, ContentNode>(JSON.parse(row.private_nodes));
    if (
      retireEditorBlocksInDoc(doc, privateNodes, () => {
        this.db
          .prepare("VACUUM INTO ?")
          .run(`${this.db.name}.pre-editor-block-retirement-v1-${randomUUID()}.bak`);
      })
    ) {
      this.db.transaction(() => {
        this.compact(id, doc);
        this.privateNodes(id, privateNodes);
      })();
    }
    return { doc, privateNodes };
  }
  create(session: CollaborationSession, doc: Y.Doc, privateNodes = new Map()) {
    this.db
      .prepare(
        "INSERT INTO sessions(id,metadata,state,private_nodes) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata"
      )
      .run(
        session.id,
        JSON.stringify(session),
        Buffer.from(Y.encodeStateAsUpdate(doc)),
        JSON.stringify([...privateNodes])
      );
  }
  metadata(session: CollaborationSession) {
    this.db
      .prepare("UPDATE sessions SET metadata=? WHERE id=?")
      .run(JSON.stringify(session), session.id);
  }
  privateNodes(id: string, values: Map<string, ContentNode>) {
    this.db
      .prepare("UPDATE sessions SET private_nodes=? WHERE id=?")
      .run(JSON.stringify([...values]), id);
  }
  append(id: string, update: Uint8Array) {
    this.db
      .prepare("INSERT INTO updates(document_id,state) VALUES (?,?)")
      .run(id, Buffer.from(update));
  }
  compact(id: string, doc: Y.Doc) {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE sessions SET state=? WHERE id=?")
        .run(Buffer.from(Y.encodeStateAsUpdate(doc)), id);
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
