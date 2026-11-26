import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  alternateWhiteboardDatabaseName,
  type WhiteboardDocumentIdentity,
} from "@/types/whiteboard-document";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";

export const journalKey = (identity: WhiteboardDocumentIdentity) =>
  JSON.stringify([
    identity.databaseName,
    identity.sourceId,
    identity.baselineId,
    identity.documentId,
    identity.epoch,
  ]);
export const stateHash = (state: Uint8Array) => createHash("sha256").update(state).digest("hex");
export interface WhiteboardCheckpoint extends WhiteboardDocumentIdentity {
  revision: number;
  hash: string;
}
export interface JournalDocument extends WhiteboardCheckpoint {
  state: Uint8Array;
  projectedRevision: number;
  projectedHash: string;
}

/** 本机不可替换日志；FULL/WAL 提交成功后才能发送耐久回执或广播。 */
export class WhiteboardJournal {
  readonly db: Database.Database;
  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new Database(filename);
    const version = Number(this.db.pragma("user_version", { simple: true }));
    if (version > 2 && filename !== ":memory:") {
      // 日志可按主库检查点重建：较新版本写入的日志整份移入 discarded/ 后新建，不阻断白板
      this.db.close();
      const discarded = join(dirname(filename), "discarded");
      mkdirSync(discarded, { recursive: true, mode: 0o700 });
      for (const suffix of ["", "-wal", "-shm"])
        if (existsSync(filename + suffix))
          renameSync(
            filename + suffix,
            join(discarded, `${Date.now()}-version-${version}-journal.db${suffix}`)
          );
      this.db = new Database(filename);
    }
    this.db.pragma("journal_mode=WAL");
    this.db.pragma("synchronous=FULL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents(document_id TEXT PRIMARY KEY, identity TEXT NOT NULL, state BLOB NOT NULL, revision INTEGER NOT NULL, hash TEXT NOT NULL, projected_revision INTEGER NOT NULL, projected_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS updates(document_id TEXT NOT NULL, batch_id TEXT NOT NULL, revision INTEGER NOT NULL, update_hash TEXT NOT NULL, state BLOB NOT NULL, state_hash TEXT NOT NULL, PRIMARY KEY(document_id,batch_id), UNIQUE(document_id,revision));
      CREATE INDEX IF NOT EXISTS updates_pending_payload ON updates(document_id,revision) WHERE length(state)>0;
      CREATE TABLE IF NOT EXISTS holds(document_id TEXT NOT NULL, source_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, PRIMARY KEY(document_id,source_id,entity_kind,entity_id));
      CREATE TABLE IF NOT EXISTS checkpoint_reclaims(target_key TEXT PRIMARY KEY, source_key TEXT NOT NULL, source_hash TEXT NOT NULL, target_hash TEXT NOT NULL);
      PRAGMA user_version=2;
    `);
  }
  load(documentId: string): JournalDocument | null {
    const row = this.db.prepare("SELECT * FROM documents WHERE document_id=?").get(documentId) as
      | {
          identity: string;
          state: Buffer;
          revision: number;
          hash: string;
          projected_revision: number;
          projected_hash: string;
        }
      | undefined;
    if (!row) return null;
    if (
      !Number.isSafeInteger(row.revision) ||
      !Number.isSafeInteger(row.projected_revision) ||
      row.projected_revision < 0 ||
      row.projected_revision > row.revision
    )
      throw new Error("白板日志修订损坏，原材料已保留");
    if (stateHash(row.state) !== row.hash) throw new Error("白板日志摘要损坏，原文件已保留");
    return {
      ...JSON.parse(row.identity),
      state: new Uint8Array(row.state),
      revision: row.revision,
      hash: row.hash,
      projectedRevision: row.projected_revision,
      projectedHash: row.projected_hash,
    };
  }
  /**
   * 坏日志自愈：原始行写入 `discarded/` 后删除该文档的日志，调用方再按主库重建。
   * 只用于读不出或与主库无法对齐的日志；能读出且领先主库的日志含未保存改动，不走这里。
   */
  quarantine(documentId: string, directory: string, reason: string): void {
    const row = this.db.prepare("SELECT * FROM documents WHERE document_id=?").get(documentId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return;
    const updates = this.db
      .prepare("SELECT * FROM updates WHERE document_id=? ORDER BY revision")
      .all(documentId) as Record<string, unknown>[];
    const encode = (value: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          Buffer.isBuffer(item) ? item.toString("base64") : item,
        ])
      );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(directory, `${Date.now()}-${stateHash(Buffer.from(documentId)).slice(0, 16)}.json`),
      JSON.stringify({ reason, document: encode(row), updates: updates.map(encode) }),
      { mode: 0o600 }
    );
    this.db.transaction(() => {
      for (const table of ["holds", "updates", "documents"])
        this.db.prepare(`DELETE FROM ${table} WHERE document_id=?`).run(documentId);
    })();
  }
  contains(identity: WhiteboardDocumentIdentity): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM documents WHERE document_id=?")
      .get(journalKey(identity));
  }
  seed(document: JournalDocument, holds: readonly ContentEntityReference[]): void {
    this.db.transaction(() => {
      if (this.load(journalKey(document))) throw new Error("不能覆盖已有白板日志");
      const { databaseName, documentId, sourceId, baselineId, epoch } = document;
      this.db
        .prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?)")
        .run(
          journalKey(document),
          JSON.stringify({ databaseName, documentId, sourceId, baselineId, epoch }),
          Buffer.from(document.state),
          document.revision,
          document.hash,
          document.projectedRevision,
          document.projectedHash
        );
      this.hold(journalKey(document), holds);
    })();
  }
  nextSharedEpoch(identity: WhiteboardDocumentIdentity): number {
    const maximum = this.db
      .prepare(
        `SELECT max(json_extract(identity,'$.epoch')) FROM documents
       WHERE json_extract(identity,'$.databaseName') IN (?,?) AND json_extract(identity,'$.sourceId')=?
       AND json_extract(identity,'$.baselineId')=? AND json_extract(identity,'$.documentId')=?`
      )
      .pluck()
      .get(
        identity.databaseName,
        alternateWhiteboardDatabaseName(identity.databaseName),
        identity.sourceId,
        identity.baselineId,
        identity.documentId
      ) as number | null;
    const next = Math.max(identity.epoch, maximum ?? 0) + 1;
    if (!Number.isSafeInteger(next)) throw new Error("白板本机代次超出范围");
    return next;
  }
  cancelReclaim(previous: WhiteboardCheckpoint): void {
    this.db
      .prepare("DELETE FROM checkpoint_reclaims WHERE source_key=? AND source_hash=?")
      .run(journalKey(previous), previous.hash);
  }
  prepareReclaim(
    previous: WhiteboardCheckpoint,
    nextHash: string,
    epoch = previous.epoch + 1
  ): boolean {
    const key = journalKey(previous);
    const next = journalKey({ ...previous, epoch });
    const row = this.db
      .prepare(
        `INSERT OR REPLACE INTO checkpoint_reclaims
       SELECT ?,document_id,hash,? FROM documents WHERE document_id=? AND revision=? AND hash=?
       AND projected_revision=revision AND projected_hash=hash
       AND NOT EXISTS (SELECT 1 FROM documents WHERE document_id IN (?,?))`
      )
      .run(
        next,
        nextHash,
        key,
        previous.revision,
        previous.hash,
        next,
        journalKey({
          ...previous,
          databaseName: alternateWhiteboardDatabaseName(previous.databaseName),
        })
      );
    return row.changes === 1;
  }

  /** 主库事务是切换点；崩溃后只按实际落盘的目标摘要完成日志交接。 */
  finishReclaim(
    current: WhiteboardDocumentIdentity & { state: Uint8Array; hash: string; revision: number },
    retained?: () => readonly ContentEntityReference[]
  ): void {
    const key = journalKey(current);
    const job = this.db
      .prepare("SELECT * FROM checkpoint_reclaims WHERE target_key=? OR source_key=?")
      .get(key, key) as
      | { target_key: string; source_key: string; source_hash: string; target_hash: string }
      | undefined;
    if (!job) return;
    if (job.source_key === key || job.target_hash !== current.hash) {
      this.db.prepare("DELETE FROM checkpoint_reclaims WHERE target_key=?").run(job.target_key);
      return;
    }
    this.db.transaction(() => {
      const result = this.db
        .prepare(
          "UPDATE documents SET document_id=?, identity=json_set(identity,'$.epoch',?), state=?, hash=?, projected_hash=? WHERE document_id=? AND revision=? AND projected_revision=revision AND hash=? AND projected_hash=hash AND NOT EXISTS (SELECT 1 FROM documents WHERE document_id=?)"
        )
        .run(
          key,
          current.epoch,
          Buffer.from(current.state),
          current.hash,
          current.hash,
          job.source_key,
          current.revision,
          job.source_hash,
          key
        );
      this.db.prepare("DELETE FROM checkpoint_reclaims WHERE target_key=?").run(key);
      // 旧日志缺失或另有分支时从已确认的主库打开，另一分支材料留在原键。
      if (result.changes !== 1) return;
      // 普通批次只能在原代次重送；助手请求按稳定业务身份幂等。
      this.db
        .prepare("DELETE FROM updates WHERE document_id=? AND batch_id NOT GLOB 'agent:*'")
        .run(job.source_key);
      this.db
        .prepare("UPDATE updates SET document_id=? WHERE document_id=?")
        .run(key, job.source_key);
      this.db
        .prepare("UPDATE holds SET document_id=? WHERE document_id=?")
        .run(key, job.source_key);
      if (retained) this.hold(key, retained());
    })();
  }
  agentReceipt(documentId: string, prefix: string, batchId: string): number | undefined {
    const row = this.db
      .prepare("SELECT batch_id,revision FROM updates WHERE document_id=? AND batch_id GLOB ?")
      .get(documentId, prefix + "*") as { batch_id: string; revision: number } | undefined;
    if (row && row.batch_id !== batchId) throw new Error("同一请求 ID 不能修改操作内容");
    return row?.revision;
  }
  receipt(documentId: string, batchId: string, update: Uint8Array): number | null {
    const row = this.db
      .prepare("SELECT revision,update_hash FROM updates WHERE document_id=? AND batch_id=?")
      .get(documentId, batchId) as { revision: number; update_hash: string } | undefined;
    if (!row) return null;
    if (row.update_hash !== stateHash(update)) throw new Error("白板批次身份不能复用于不同更新");
    return row.revision;
  }
  append(
    previous: JournalDocument,
    batchId: string,
    update: Uint8Array,
    state: Uint8Array,
    holds: readonly ContentEntityReference[]
  ): JournalDocument {
    const next = { ...previous, state, revision: previous.revision + 1, hash: stateHash(state) };
    this.db.transaction(() => {
      const current = this.load(journalKey(previous));
      if (!current || current.revision !== previous.revision || current.hash !== previous.hash)
        throw new Error("白板日志修订冲突");
      this.db
        .prepare("INSERT INTO updates VALUES(?,?,?,?,?,?)")
        .run(
          journalKey(previous),
          batchId,
          next.revision,
          stateHash(update),
          Buffer.from(update),
          next.hash
        );
      this.db
        .prepare("UPDATE documents SET state=?,revision=?,hash=? WHERE document_id=?")
        .run(Buffer.from(state), next.revision, next.hash, journalKey(next));
      this.hold(journalKey(next), holds);
    })();
    return next;
  }
  markProjected(document: JournalDocument): void {
    this.db.transaction(() => {
      const result = this.db
        .prepare(
          "UPDATE documents SET projected_revision=?,projected_hash=? WHERE document_id=? AND revision=? AND hash=?"
        )
        .run(
          document.revision,
          document.hash,
          journalKey(document),
          document.revision,
          document.hash
        );
      if (result.changes !== 1) throw new Error("白板投影回执与当前日志不一致");
      // 完整检查点和主库已确认后只保留批次摘要，重复提交仍能校验原字节。
      this.db
        .prepare(
          "UPDATE updates SET state=x'' WHERE document_id=? AND revision<=? AND length(state)>0"
        )
        .run(journalKey(document), document.revision);
    })();
  }
  private hold(documentId: string, references: readonly ContentEntityReference[]): void {
    const insert = this.db.prepare("INSERT OR IGNORE INTO holds VALUES(?,?,?,?)");
    for (const ref of references) insert.run(documentId, ref.sourceId, ref.kind, ref.entityId);
  }
  holds(databaseName: string, exceptDocumentId?: string): ContentEntityReference[] {
    return (
      this.db
        .prepare(
          "SELECT h.* FROM holds h JOIN documents d ON d.document_id=h.document_id WHERE json_extract(d.identity,'$.databaseName')=?" +
            (exceptDocumentId === undefined
              ? ""
              : " AND json_extract(d.identity,'$.documentId')<>?")
        )
        .all(
          ...(exceptDocumentId === undefined ? [databaseName] : [databaseName, exceptDocumentId])
        ) as {
        source_id: string;
        entity_kind: ContentEntityReference["kind"];
        entity_id: string;
      }[]
    ).map(row => ({ sourceId: row.source_id, kind: row.entity_kind, entityId: row.entity_id }));
  }
  /** 整库被替换前释放该库的日志：只有已完整投影进旧库的日志才能释放，否则整体拒绝。 */
  releaseLibrary(databaseName: string): number {
    return this.db.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT document_id FROM documents WHERE json_extract(identity,'$.databaseName')=?"
        )
        .all(databaseName) as { document_id: string }[];
      for (const row of rows) {
        const saved = this.load(row.document_id);
        if (!saved) throw new Error(`白板日志读取失败：${row.document_id}`);
        if (saved.projectedRevision !== saved.revision || saved.projectedHash !== saved.hash)
          throw new Error("白板仍有未保存进资料库的改动，不能替换资料库");
      }
      for (const row of rows)
        this.db
          .prepare("DELETE FROM checkpoint_reclaims WHERE source_key=? OR target_key=?")
          .run(row.document_id, row.document_id);
      for (const row of rows)
        for (const table of ["holds", "updates", "documents"])
          this.db.prepare(`DELETE FROM ${table} WHERE document_id=?`).run(row.document_id);
      return rows.length;
    })();
  }
  retire(identity: WhiteboardDocumentIdentity): void {
    this.db.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT document_id FROM documents WHERE json_extract(identity,'$.databaseName')=? AND json_extract(identity,'$.sourceId')=? AND json_extract(identity,'$.documentId')=?"
        )
        .all(identity.databaseName, identity.sourceId, identity.documentId) as {
        document_id: string;
      }[];
      for (const row of rows) {
        const saved = this.load(row.document_id);
        if (!saved) throw new Error(`白板日志读取失败：${row.document_id}`);
        if (saved.projectedRevision !== saved.revision || saved.projectedHash !== saved.hash)
          throw new Error("白板仍有未投影日志，不能回收");
      }
      for (const row of rows) {
        this.db
          .prepare("DELETE FROM checkpoint_reclaims WHERE source_key=? OR target_key=?")
          .run(row.document_id, row.document_id);
        for (const table of ["holds", "updates", "documents"])
          this.db.prepare(`DELETE FROM ${table} WHERE document_id=?`).run(row.document_id);
      }
    })();
  }
  close(): void {
    this.db.close();
  }
}
