import { CollaborationError } from "./protocol";
import {
  beginDocumentMigration,
  cancelDocumentMigration,
  commitDocumentMigration,
  freezeDocumentMigration,
  refreshDocumentMigration,
  type DocumentMigration,
  type MigrationDocument,
  type MigrationFingerprint,
  type MigrationTransition,
} from "./document-migration";

type Parameter = string | number | null;
export interface MigrationSql {
  exec(sql: string, ...parameters: Parameter[]): void;
  get<T>(sql: string, ...parameters: Parameter[]): T | undefined;
  transaction<T>(action: () => T): T;
}

/** 安装正文与保存终态共用调用方的 SQLite 事务，不跨网络等待。 */
export class MigrationLedger {
  private readonly verified = new Map<string, string>();
  constructor(
    private readonly sql: MigrationSql,
    private readonly readCurrent: (id: string) => MigrationDocument,
    private readonly now: () => number = Date.now,
    private readonly resolveActor: (id: string) => string = id => id
  ) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS collaboration_protocol (document_id TEXT PRIMARY KEY, value TEXT NOT NULL)"
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS collaboration_migrations (operation_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, value TEXT NOT NULL)"
    );
  }

  publication(documentId: string) {
    const row = this.sql.get<{ value: string }>(
      "SELECT value FROM collaboration_protocol WHERE document_id=?",
      documentId
    );
    return row ? ((JSON.parse(row.value) as MigrationDocument).publication ?? null) : null;
  }

  publish(document: MigrationDocument, install: () => void): void {
    this.sql.transaction(() => {
      const previous = this.publication(document.id);
      const publication = {
        candidateHash: document.revision,
        baselineId: document.baselineId!,
        version: document.version,
      };
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(publication))
          throw new CollaborationError("PUBLICATION_CONFLICT", "首次发布不能更换已接纳候选", 409);
        return;
      }
      install();
      this.sql.exec(
        "INSERT INTO collaboration_protocol(document_id,value) VALUES (?,?)",
        document.id,
        JSON.stringify({ ...document, publication })
      );
    });
  }

  private operation(id: string): DocumentMigration | undefined {
    const row = this.sql.get<{ value: string }>(
      "SELECT value FROM collaboration_migrations WHERE operation_id=?",
      id
    );
    if (!row) return undefined;
    const operation = JSON.parse(row.value) as DocumentMigration;
    return { ...operation, actorId: this.resolveActor(operation.actorId) };
  }

  private document(id: string): MigrationDocument {
    const row = this.sql.get<{ value: string }>(
      "SELECT value FROM collaboration_protocol WHERE document_id=?",
      id
    );
    if (!row) return this.readCurrent(id);
    const stored = JSON.parse(row.value) as MigrationDocument;
    if (stored.version > 1 && this.verified.get(id) === row.value)
      return { ...stored, ownerId: this.resolveActor(stored.ownerId) };
    const live = this.readCurrent(id);
    if (
      stored.epoch !== live.epoch ||
      stored.version !== live.version ||
      stored.baselineId !== live.baselineId
    )
      throw new CollaborationError("MIGRATION_STORAGE_CONFLICT", "持久化协议与正文基线不一致", 409);
    const current = { ...stored, id: live.id, ownerId: live.ownerId, revision: live.revision };
    if (current.version > 1) {
      const value = JSON.stringify(current);
      this.sql.exec("UPDATE collaboration_protocol SET value=? WHERE document_id=?", value, id);
      // 缓存绑定实际 SQL 值，事务回滚后旧值不会命中；重启后首次读取重新校验全文。
      this.verified.set(id, value);
    }
    return current;
  }

  /** 与正文增量同事务更新，普通轮询只读已核验的协议记录。 */
  updateRevision(documentId: string, revision: string): void {
    const document = this.document(documentId);
    const value = JSON.stringify({ ...document, revision });
    this.sql.exec(
      "UPDATE collaboration_protocol SET value=? WHERE document_id=?",
      value,
      documentId
    );
    this.verified.set(documentId, value);
  }

  invalidate(documentId?: string): void {
    if (documentId === undefined) this.verified.clear();
    else this.verified.delete(documentId);
  }

  private save(transition: MigrationTransition): DocumentMigration {
    this.sql.exec(
      "INSERT INTO collaboration_protocol(document_id,value) VALUES (?,?) ON CONFLICT(document_id) DO UPDATE SET value=excluded.value",
      transition.document.id,
      JSON.stringify(transition.document)
    );
    this.sql.exec(
      "INSERT INTO collaboration_migrations(operation_id,document_id,value) VALUES (?,?,?) ON CONFLICT(operation_id) DO UPDATE SET value=excluded.value",
      transition.operation.id,
      transition.operation.documentId,
      JSON.stringify(transition.operation)
    );
    return transition.operation;
  }

  private active(document: MigrationDocument): MigrationDocument {
    if (!document.migrationId) return document;
    const operation = this.operation(document.migrationId);
    if (!operation || operation.documentId !== document.id)
      throw new CollaborationError("MIGRATION_STORAGE_CONFLICT", "文档迁移记录缺失", 409);
    const checked = refreshDocumentMigration(document, operation, this.now());
    if (checked.operation !== operation) this.save(checked);
    return checked.document;
  }

  state(documentId: string): MigrationDocument {
    return this.sql.transaction(() => this.active(this.document(documentId)));
  }

  assertWritable(
    documentId: string,
    expected?: Pick<MigrationDocument, "epoch" | "version" | "baselineId">
  ): MigrationDocument {
    const document = this.state(documentId);
    if (
      expected &&
      (document.epoch !== expected.epoch ||
        document.version !== expected.version ||
        document.baselineId !== expected.baselineId)
    )
      throw new CollaborationError(
        "EPOCH_CONFLICT",
        "连接属于旧文档基线，请先保全未确认内容后重新加载",
        409
      );
    if (document.frozen)
      throw new CollaborationError("MIGRATION_FROZEN", "文档正在迁移，暂不接受写入", 409);
    return document;
  }

  get(documentId: string, operationId: string, actorId: string): DocumentMigration | null {
    return this.sql.transaction(() => {
      const document = this.active(this.document(documentId));
      if (document.ownerId !== actorId)
        throw new CollaborationError("FORBIDDEN", "只有所有者可以读取迁移回执", 403);
      const operation = this.operation(operationId);
      if (!operation) return null;
      if (operation.documentId !== documentId || operation.actorId !== actorId)
        throw new CollaborationError("MIGRATION_IDENTITY_CONFLICT", "迁移操作身份不匹配", 409);
      return this.save(refreshDocumentMigration(document, operation, this.now()));
    });
  }

  begin(
    documentId: string,
    request: { id: string; actorId: string; expectedEpoch: number; expiresAt: number }
  ): DocumentMigration {
    return this.sql.transaction(() =>
      this.save(
        beginDocumentMigration(
          this.active(this.document(documentId)),
          request,
          this.operation(request.id),
          this.now()
        )
      )
    );
  }

  freeze(documentId: string, operationId: string, actorId: string): DocumentMigration {
    return this.sql.transaction(() => {
      const operation = this.operation(operationId);
      if (!operation) throw new CollaborationError("MIGRATION_NOT_FOUND", "迁移操作尚未登记", 404);
      return this.save(
        freezeDocumentMigration(this.document(documentId), operation, actorId, this.now())
      );
    });
  }

  commit(
    documentId: string,
    operationId: string,
    actorId: string,
    fingerprint: MigrationFingerprint,
    install: (document: MigrationDocument) => void
  ): DocumentMigration {
    return this.sql.transaction(() => {
      const operation = this.operation(operationId);
      if (!operation) throw new CollaborationError("MIGRATION_NOT_FOUND", "迁移操作尚未登记", 404);
      const transition = commitDocumentMigration(
        this.document(documentId),
        operation,
        actorId,
        fingerprint,
        this.now()
      );
      if (transition.install) install(transition.document);
      return this.save(transition);
    });
  }

  cancel(
    documentId: string,
    request: { id: string; actorId: string; expectedEpoch: number }
  ): DocumentMigration {
    return this.sql.transaction(() =>
      this.save(
        cancelDocumentMigration(
          this.document(documentId),
          request,
          this.operation(request.id),
          this.now()
        )
      )
    );
  }
}
