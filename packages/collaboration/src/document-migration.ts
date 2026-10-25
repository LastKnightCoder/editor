import { CollaborationError } from "./protocol";

export interface MigrationDocument {
  id: string;
  ownerId: string;
  epoch: number;
  revision: string;
  version: number;
  baselineId?: string;
  migrationId?: string;
  frozen?: boolean;
  publication?: { candidateHash: string; baselineId: string; version: number };
}

export interface MigrationFingerprint {
  expectedRevision: string;
  candidateHash: string;
  targetVersion: number;
  baselineId: string;
}

export interface MigrationReceipt {
  operationId: string;
  documentId: string;
  epoch: number;
  revision: string;
  version: number;
  baselineId: string;
}

export interface DocumentMigration {
  id: string;
  documentId: string;
  actorId: string;
  expectedEpoch: number;
  expiresAt: number;
  state: "PENDING" | "COMMITTED" | "ABORTED" | "EXPIRED";
  frozenRevision?: string;
  fingerprint?: MigrationFingerprint;
  receipt?: MigrationReceipt;
  reason?: string;
}

export interface MigrationTransition {
  document: MigrationDocument;
  operation: DocumentMigration;
  install: boolean;
}

const fail = (code: string, message: string, status = 409): never => {
  throw new CollaborationError(code, message, status);
};
const token = (value: string) => {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 256 ||
    [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    fail("INVALID_MIGRATION", "迁移标识无效", 400);
};
function owner(document: MigrationDocument, actorId: string) {
  if (document.ownerId !== actorId) fail("FORBIDDEN", "只有文档所有者可以迁移", 403);
}
function identity(
  document: MigrationDocument,
  operation: DocumentMigration,
  id: string,
  actorId: string
) {
  owner(document, actorId);
  if (operation.id !== id || operation.documentId !== document.id || operation.actorId !== actorId)
    fail("MIGRATION_IDENTITY_CONFLICT", "迁移操作身份不匹配");
}
function unlock(document: MigrationDocument, id: string): MigrationDocument {
  if (document.migrationId !== id) return document;
  const { migrationId: _migrationId, frozen: _frozen, ...rest } = document;
  return rest;
}

/** 调用方在同一持久化事务中写回 document 和 operation；本模块不保存或安装正文。 */
export function refreshDocumentMigration(
  document: MigrationDocument,
  operation: DocumentMigration,
  now: number
): MigrationTransition {
  if (operation.state === "PENDING" && now >= operation.expiresAt) {
    return {
      document: unlock(document, operation.id),
      operation: { ...operation, state: "EXPIRED", reason: "deadline" },
      install: false,
    };
  }
  return { document, operation, install: false };
}

export function beginDocumentMigration(
  document: MigrationDocument,
  request: { id: string; actorId: string; expectedEpoch: number; expiresAt: number },
  previous: DocumentMigration | undefined,
  now: number
): MigrationTransition {
  token(request.id);
  owner(document, request.actorId);
  if (previous) {
    identity(document, previous, request.id, request.actorId);
    if (previous.expectedEpoch !== request.expectedEpoch)
      fail("MIGRATION_IDENTITY_CONFLICT", "操作不能更换基线代次");
    return refreshDocumentMigration(document, previous, now);
  }
  if (
    !Number.isSafeInteger(request.expectedEpoch) ||
    request.expectedEpoch < 0 ||
    !Number.isSafeInteger(request.expiresAt) ||
    request.expiresAt <= now ||
    request.expiresAt - now > 5 * 60_000
  )
    fail("INVALID_MIGRATION", "迁移代次或期限无效", 400);
  if (document.epoch !== request.expectedEpoch) fail("EPOCH_CONFLICT", "文档代次已变化");
  if (document.migrationId) fail("MIGRATION_BUSY", "文档已有迁移操作");
  return {
    document: { ...document, migrationId: request.id, frozen: false },
    operation: {
      id: request.id,
      documentId: document.id,
      actorId: request.actorId,
      expectedEpoch: request.expectedEpoch,
      expiresAt: request.expiresAt,
      state: "PENDING",
    },
    install: false,
  };
}

export function freezeDocumentMigration(
  document: MigrationDocument,
  operation: DocumentMigration,
  actorId: string,
  now: number
): MigrationTransition {
  identity(document, operation, operation.id, actorId);
  const checked = refreshDocumentMigration(document, operation, now);
  if (checked.operation.state !== "PENDING") return checked;
  if (document.migrationId !== operation.id || document.epoch !== operation.expectedEpoch)
    return {
      document: unlock(document, operation.id),
      operation: { ...operation, state: "ABORTED", reason: "baseline-changed" },
      install: false,
    };
  if (operation.frozenRevision !== undefined) return checked;
  return {
    document: { ...document, frozen: true },
    operation: { ...operation, frozenRevision: document.revision },
    install: false,
  };
}

function assertFingerprint(fingerprint: MigrationFingerprint) {
  token(fingerprint.expectedRevision);
  token(fingerprint.baselineId);
  if (
    !/^[a-f0-9]{64}$/.test(fingerprint.candidateHash) ||
    !Number.isSafeInteger(fingerprint.targetVersion) ||
    fingerprint.targetVersion < 1
  )
    fail("INVALID_MIGRATION", "迁移候选摘要或目标版本无效", 400);
}

function sameFingerprint(left: MigrationFingerprint, right: MigrationFingerprint) {
  return (
    left.expectedRevision === right.expectedRevision &&
    left.candidateHash === right.candidateHash &&
    left.targetVersion === right.targetVersion &&
    left.baselineId === right.baselineId
  );
}

export function commitDocumentMigration(
  document: MigrationDocument,
  operation: DocumentMigration,
  actorId: string,
  fingerprint: MigrationFingerprint,
  now: number
): MigrationTransition {
  identity(document, operation, operation.id, actorId);
  assertFingerprint(fingerprint);
  if (operation.fingerprint && !sameFingerprint(operation.fingerprint, fingerprint))
    fail("MIGRATION_IDENTITY_CONFLICT", "同一操作不能更换迁移候选");
  const checked = refreshDocumentMigration(document, operation, now);
  if (checked.operation.state !== "PENDING") return checked;
  const bound = { ...operation, fingerprint: { ...fingerprint } };
  const valid =
    document.migrationId === operation.id &&
    document.frozen === true &&
    document.epoch === operation.expectedEpoch &&
    document.revision === fingerprint.expectedRevision &&
    operation.frozenRevision === fingerprint.expectedRevision &&
    document.baselineId !== fingerprint.baselineId;
  if (!valid)
    return {
      document: unlock(document, operation.id),
      operation: { ...bound, state: "ABORTED", reason: "baseline-changed" },
      install: false,
    };
  if (!Number.isSafeInteger(document.epoch + 1)) fail("INVALID_MIGRATION", "文档代次超过范围", 400);
  const receipt: MigrationReceipt = {
    operationId: operation.id,
    documentId: document.id,
    epoch: document.epoch + 1,
    revision: fingerprint.candidateHash,
    version: fingerprint.targetVersion,
    baselineId: fingerprint.baselineId,
  };
  return {
    document: {
      ...unlock(document, operation.id),
      epoch: receipt.epoch,
      revision: receipt.revision,
      version: receipt.version,
      baselineId: receipt.baselineId,
    },
    operation: { ...bound, state: "COMMITTED", receipt },
    install: true,
  };
}

export function cancelDocumentMigration(
  document: MigrationDocument,
  request: { id: string; actorId: string; expectedEpoch: number },
  previous: DocumentMigration | undefined,
  now: number
): MigrationTransition {
  token(request.id);
  owner(document, request.actorId);
  if (!Number.isSafeInteger(request.expectedEpoch) || request.expectedEpoch < 0)
    fail("INVALID_MIGRATION", "取消操作代次无效", 400);
  if (previous) {
    identity(document, previous, request.id, request.actorId);
    if (previous.expectedEpoch !== request.expectedEpoch)
      fail("MIGRATION_IDENTITY_CONFLICT", "取消操作基线不匹配");
    const checked = refreshDocumentMigration(document, previous, now);
    if (checked.operation.state !== "PENDING") return checked;
    return {
      document: unlock(document, previous.id),
      operation: { ...previous, state: "ABORTED", reason: "cancelled" },
      install: false,
    };
  }
  // 取消先到也保存终止记录，阻止网络中迟到的首次准备或提交。
  return {
    document: unlock(document, request.id),
    operation: {
      id: request.id,
      documentId: document.id,
      actorId: request.actorId,
      expectedEpoch: request.expectedEpoch,
      expiresAt: now,
      state: "ABORTED",
      reason: "cancelled-before-start",
    },
    install: false,
  };
}
