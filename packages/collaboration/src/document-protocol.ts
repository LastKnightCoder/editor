import { CollaborationError } from "./protocol";
import { assertCurrentDocumentVersion } from "./document-version";

export interface DocumentProtocol {
  id: string;
  ownerId: string;
  epoch: number;
  revision: string;
  version: number;
  baselineId: string;
  publication?: { candidateHash: string; baselineId: string; version: number };
}

type Parameter = string | number | null;
export interface DocumentSql {
  exec(sql: string, ...parameters: Parameter[]): void;
  get<T>(sql: string, ...parameters: Parameter[]): T | undefined;
  transaction<T>(action: () => T): T;
}

/** 旧迁移未完成的文档只拒绝读取，不自动解冻或覆盖。 */
export function readDocumentProtocol(value: string): DocumentProtocol {
  const document = JSON.parse(value);
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw new CollaborationError("INVALID_DOCUMENT", "持久化协议记录无效", 409);
  if (Object.hasOwn(document, "migrationId") || Object.hasOwn(document, "frozen"))
    throw new CollaborationError("UNSUPPORTED_DOCUMENT", "文档包含已退役的格式迁移状态", 409);
  assertCurrentDocumentVersion(document.version);
  if (
    typeof document.baselineId !== "string" ||
    !document.baselineId ||
    !Number.isSafeInteger(document.epoch) ||
    document.epoch < 0
  )
    throw new CollaborationError("INVALID_DOCUMENT", "持久化文档基线无效", 409);
  return document as DocumentProtocol;
}

/** 当前协议、首次发布与修订缓存；调用方负责与正文共用 SQLite 事务。 */
export class DocumentProtocolStore {
  private readonly verified = new Map<string, string>();
  constructor(
    private readonly sql: DocumentSql,
    private readonly readCurrent: (id: string) => DocumentProtocol
  ) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS collaboration_protocol (document_id TEXT PRIMARY KEY, value TEXT NOT NULL)"
    );
  }
  publication(documentId: string) {
    const row = this.sql.get<{ value: string }>(
      "SELECT value FROM collaboration_protocol WHERE document_id=?",
      documentId
    );
    return row ? (readDocumentProtocol(row.value).publication ?? null) : null;
  }

  publish(document: DocumentProtocol, install: () => void): void {
    assertCurrentDocumentVersion(document.version);
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

  private document(id: string): DocumentProtocol {
    const row = this.sql.get<{ value: string }>(
      "SELECT value FROM collaboration_protocol WHERE document_id=?",
      id
    );
    if (!row) throw new CollaborationError("UNSUPPORTED_DOCUMENT", "文档缺少当前协议记录", 409);
    const stored = readDocumentProtocol(row.value);
    if (this.verified.get(id) === row.value) return stored;
    const live = this.readCurrent(id);
    if (
      stored.epoch !== live.epoch ||
      stored.version !== live.version ||
      stored.baselineId !== live.baselineId
    )
      throw new CollaborationError("PROTOCOL_STORAGE_CONFLICT", "持久化协议与正文基线不一致", 409);
    const current = { ...stored, id: live.id, ownerId: live.ownerId, revision: live.revision };
    const value = JSON.stringify(current);
    this.sql.exec("UPDATE collaboration_protocol SET value=? WHERE document_id=?", value, id);
    // 缓存绑定实际 SQL 值，事务回滚后旧值不会命中；重启后首次读取重新校验全文。
    this.verified.set(id, value);
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

  state(documentId: string): DocumentProtocol {
    return this.sql.transaction(() => this.document(documentId));
  }

  assertWritable(
    documentId: string,
    expected?: Pick<DocumentProtocol, "epoch" | "version" | "baselineId">
  ): DocumentProtocol {
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
    return document;
  }
}
