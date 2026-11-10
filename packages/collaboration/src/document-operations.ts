import { CollaborationError } from "./protocol";
import type { DocumentSql, DocumentProtocol } from "./document-protocol";
import {
  scopedUndoSourceId,
  type ScopedContentConflict,
  type ScopedContentEdits,
} from "./scoped-content-edit";
import { sharedValueEquals } from "./shared-values";

export interface DocumentOperationRequest {
  operationId: string;
  epoch: number;
  baselineId: string;
  version: number;
  updateHash: string;
  expiresAt: number;
  expectedRevision?: string;
  expectedSequence?: number;
  kind?: "scoped-edit";
  source?: ScopedContentEdits["source"];
}
export interface DocumentOperation extends DocumentOperationRequest {
  documentId: string;
  actorId: string;
  state: "PENDING" | "COMMITTED" | "ABORTED" | "EXPIRED";
  reason?: string;
  conflicts?: ScopedContentConflict[];
  receipt?: {
    documentId: string;
    epoch: number;
    baselineId: string;
    revision: string;
    sequence: number;
    inverse?: ScopedContentEdits;
  };
}
const fail = (code: string, message: string): never => {
  throw new CollaborationError(code, message, 409);
};
const fingerprint = (request: DocumentOperationRequest) =>
  JSON.stringify([
    request.operationId,
    request.epoch,
    request.baselineId,
    request.version,
    request.updateHash,
    request.expiresAt,
    request.expectedRevision ?? null,
    request.expectedSequence ?? null,
    request.kind ?? null,
  ]);

/** 普通条件提交保留 epoch，回执与更新必须同事务提交。 */
export class DocumentOperationLedger {
  constructor(
    private readonly sql: DocumentSql,
    private readonly now = Date.now
  ) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS collaboration_operations (document_id TEXT NOT NULL, operation_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(document_id,operation_id))"
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS collaboration_sequences (document_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL)"
    );
  }
  sequence(documentId: string): number {
    return (
      this.sql.get<{ sequence: number }>(
        "SELECT sequence FROM collaboration_sequences WHERE document_id=?",
        documentId
      )?.sequence ?? 0
    );
  }
  advance(documentId: string): number {
    const next = this.sequence(documentId) + 1;
    if (!Number.isSafeInteger(next)) fail("CAPACITY", "文档修订超过范围");
    this.sql.exec(
      "INSERT INTO collaboration_sequences VALUES (?,?) ON CONFLICT(document_id) DO UPDATE SET sequence=excluded.sequence",
      documentId,
      next
    );
    return next;
  }
  private save(operation: DocumentOperation): DocumentOperation {
    this.sql.exec(
      "INSERT INTO collaboration_operations VALUES (?,?,?) ON CONFLICT(document_id,operation_id) DO UPDATE SET value=excluded.value",
      operation.documentId,
      operation.operationId,
      JSON.stringify(operation)
    );
    return operation;
  }
  get(documentId: string, operationId: string, actorId: string): DocumentOperation | null {
    const row = this.sql.get<{ value: string }>(
      "SELECT value FROM collaboration_operations WHERE document_id=? AND operation_id=?",
      documentId,
      operationId
    );
    if (!row) return null;
    const operation = JSON.parse(row.value) as DocumentOperation;
    if (operation.actorId !== actorId) fail("OPERATION_IDENTITY_CONFLICT", "操作不属于此设备");
    if (operation.state === "PENDING" && this.now() >= operation.expiresAt)
      return this.save({ ...operation, state: "EXPIRED", reason: "deadline" });
    return operation;
  }
  isScopedUndo(operation: DocumentOperation, scope: ScopedContentEdits): boolean {
    const sourceId = scopedUndoSourceId(operation.operationId);
    if (sourceId === undefined) return false;
    const source = this.get(operation.documentId, sourceId, operation.actorId);
    if (
      source?.state !== "COMMITTED" ||
      source.baselineId !== operation.baselineId ||
      source.epoch !== operation.epoch ||
      !source.receipt?.inverse ||
      scope.contracts !== undefined ||
      !sharedValueEquals(scope.edits, source.receipt.inverse.edits)
    )
      fail("INVALID_UNDO", "撤销请求与原操作回执不符");
    return true;
  }
  begin(documentId: string, actorId: string, request: DocumentOperationRequest): DocumentOperation {
    if (
      !request ||
      typeof request.operationId !== "string" ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(request.operationId) ||
      !Number.isSafeInteger(request.epoch) ||
      request.epoch < 0 ||
      ![2, 3].includes(request.version) ||
      typeof request.baselineId !== "string" ||
      !request.baselineId ||
      request.baselineId.length > 256 ||
      [...request.baselineId].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      !/^[a-f0-9]{64}$/.test(request.updateHash) ||
      !Number.isSafeInteger(request.expiresAt) ||
      (request.kind !== undefined &&
        (request.kind !== "scoped-edit" ||
          request.version !== 2 ||
          request.expectedRevision !== undefined ||
          request.expectedSequence !== undefined)) ||
      (request.expectedRevision !== undefined &&
        (!/^[a-f0-9]{64}$/.test(request.expectedRevision) ||
          !Number.isSafeInteger(request.expectedSequence) ||
          request.expectedSequence! < 0)) ||
      (request.expectedRevision === undefined && request.expectedSequence !== undefined)
    )
      fail("INVALID_OPERATION", "编辑操作指纹无效");
    return this.sql.transaction(() => {
      const previous = this.get(documentId, request.operationId, actorId);
      if (previous) {
        if (fingerprint(previous) !== fingerprint(request))
          fail("OPERATION_IDENTITY_CONFLICT", "同一操作不能更换候选或基线");
        return previous;
      }
      if (request.expiresAt > this.now() + 5 * 60_000) fail("INVALID_OPERATION", "操作期限过长");
      return this.save({
        operationId: request.operationId,
        epoch: request.epoch,
        baselineId: request.baselineId,
        version: request.version,
        updateHash: request.updateHash,
        expiresAt: request.expiresAt,
        ...(request.kind === "scoped-edit" ? { kind: request.kind, source: request.source } : {}),
        ...(request.expectedRevision === undefined
          ? {}
          : {
              expectedRevision: request.expectedRevision,
              expectedSequence: request.expectedSequence,
            }),
        documentId,
        actorId,
        state: request.expiresAt <= this.now() ? "EXPIRED" : "PENDING",
      });
    });
  }
  abort(
    operation: DocumentOperation,
    reason: string,
    conflicts?: ScopedContentConflict[]
  ): DocumentOperation {
    return this.sql.transaction(() => {
      const current = this.get(operation.documentId, operation.operationId, operation.actorId);
      if (!current) return fail("OPERATION_NOT_FOUND", "操作不存在");
      return current.state === "PENDING"
        ? this.save({ ...current, state: "ABORTED", reason, ...(conflicts ? { conflicts } : {}) })
        : current;
    });
  }
  commit(
    operation: DocumentOperation,
    read: () => DocumentProtocol,
    revision: string,
    install: () => void,
    inverse?: ScopedContentEdits
  ): DocumentOperation {
    return this.sql.transaction(() => {
      const current = this.get(operation.documentId, operation.operationId, operation.actorId);
      if (!current) return fail("OPERATION_NOT_FOUND", "操作不存在");
      if (current.state !== "PENDING") return current;
      const document = read();
      if (
        document.epoch !== current.epoch ||
        document.baselineId !== current.baselineId ||
        document.version !== current.version
      )
        return this.save({ ...current, state: "ABORTED", reason: "EPOCH_CONFLICT" });
      if (
        current.expectedRevision !== undefined &&
        (document.revision !== current.expectedRevision ||
          this.sequence(current.documentId) !== current.expectedSequence)
      )
        return this.save({ ...current, state: "ABORTED", reason: "REVISION_CONFLICT" });
      install();
      return this.save({
        ...current,
        state: "COMMITTED",
        receipt: {
          documentId: current.documentId,
          epoch: current.epoch,
          baselineId: current.baselineId,
          revision,
          sequence: this.sequence(current.documentId),
          ...(inverse ? { inverse } : {}),
        },
      });
    });
  }
}
