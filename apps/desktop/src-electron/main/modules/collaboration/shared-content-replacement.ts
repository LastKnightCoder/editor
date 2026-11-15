import { createHash } from "node:crypto";
import {
  NODE_DOCUMENT_VERSION,
  readDocumentIdentity,
  type DocumentOperation,
  type DocumentOperationRequest,
  type DocumentStateResponse,
  type SourceBinding,
} from "@tau/collaboration";
import type { CollaborationClient } from "./client";
import { sharedReplacementDraftId, type ContentLocalState } from "./content-local-state";
import type { CollaborationLocalStore } from "./local-store";
import type { NodeSessionUpdates } from "./node-session-updates";
import type { RuntimeSession } from "./types";

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const roomKey = (url: string, roomId: string) =>
  `shared-replacement:${digest(JSON.stringify([url, roomId]))}:`;
const settingKey = (url: string, roomId: string, baselineId: string) =>
  roomKey(url, roomId) + digest(baselineId);
const documentRoute = (id: string) => `/v1/documents/${encodeURIComponent(id)}`;
const operationRoute = (record: ReplacementRecord) =>
  `${documentRoute(record.roomId)}/operations/${encodeURIComponent(record.request.operationId)}`;
const pending = (id: string) => new Error(`CONTENT_REPLACEMENT_PENDING: ${id} 正在等待共享回执`);

type SourceIdentity = Pick<
  SourceBinding,
  "databaseName" | "librarySourceId" | "contentId" | "contentCreatedAt" | "contentDocumentId"
>;
type ReplacementOutcome =
  | { state: "COMMITTED"; receipt: NonNullable<DocumentOperation["receipt"]> }
  | { state: "ABORTED" | "EXPIRED"; reason: string };
type ReplacementRequest = DocumentOperationRequest & {
  expectedRevision: string;
  expectedSequence: number;
};
interface ReplacementRecord {
  roomId: string;
  serverUrl: string;
  source: SourceIdentity;
  actorId: string;
  intentHash: string;
  request: ReplacementRequest;
  outcome?: ReplacementOutcome;
}

export interface PreparedSharedReplacement {
  operationId: string;
  intentHash: string;
  expectedRevision: string;
  update: Uint8Array;
  candidateState: Uint8Array;
  retainCandidate(): void;
}

function matchesSource(current: SourceIdentity, saved: SourceIdentity): boolean {
  return (
    current.databaseName === saved.databaseName &&
    current.librarySourceId === saved.librarySourceId &&
    current.contentId === saved.contentId &&
    current.contentCreatedAt === saved.contentCreatedAt &&
    current.contentDocumentId === saved.contentDocumentId
  );
}

/** 整篇替换的待确认请求留在共享库，恢复仅回查原账本。 */
export class SharedContentReplacement {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly store: CollaborationLocalStore,
    private readonly drafts: ContentLocalState,
    private readonly updates: NodeSessionUpdates,
    private readonly getClient: () => CollaborationClient,
    private readonly assertSession: (session: RuntimeSession) => SourceBinding
  ) {}

  hasPending(serverUrl: string, roomId: string): boolean {
    return Boolean(
      this.store.db
        .prepare(
          `SELECT 1 FROM settings WHERE key GLOB ? AND json_valid(value) AND json_extract(value, '$.outcome') IS NULL LIMIT 1`
        )
        .get(`${roomKey(serverUrl, roomId)}*`)
    );
  }

  private get client() {
    return this.getClient();
  }

  async retry(
    session: RuntimeSession,
    intentHash: string,
    checkScope: () => void,
    onAccepted?: () => void
  ): Promise<boolean> {
    const record = this.read(session);
    if (!record) return false;
    const same = record.intentHash === intentHash;
    if (record.outcome && !same) return false;
    await this.run(record, async () => {
      const operation = await this.lookup(session, record);
      await this.settle(
        session,
        record,
        operation,
        same ? checkScope : undefined,
        same ? onAccepted : undefined
      );
    });
    checkScope();
    return same;
  }

  async recover(session: RuntimeSession): Promise<boolean> {
    const record = this.read(session);
    if (!record || record.outcome || this.inFlight.has(record.request.operationId)) return false;
    await this.run(record, async () => {
      const operation = await this.lookup(session, record);
      await this.settle(session, record, operation);
    });
    return this.read(session)?.outcome?.state === "COMMITTED";
  }

  async submit(
    session: RuntimeSession,
    prepared: PreparedSharedReplacement,
    checkRevision: () => void,
    checkScope: () => void,
    onAccepted?: () => void
  ): Promise<void> {
    const source = this.assertSession(session);
    const observedSource = session.info.source;
    const { documentId, baselineId, epoch } = readDocumentIdentity(session.doc);
    const serverUrl = session.info.serverUrl;
    const saveCandidate = () => {
      this.drafts.saveDocumentDraft(
        { workspaceId: source.databaseName, documentId, baselineId, epoch },
        sharedReplacementDraftId(prepared.operationId),
        { state: prepared.candidateState, sequence: 1 }
      );
      prepared.retainCandidate();
    };
    let actorId: string, protocol: DocumentStateResponse["protocol"], expiresAt: number;
    try {
      actorId = (await this.client.identity(serverUrl)).id;
      protocol = await this.client.request<DocumentStateResponse["protocol"]>(
        serverUrl,
        `${documentRoute(documentId)}/protocol`
      );
      checkRevision();
      if (
        protocol.id !== documentId ||
        protocol.version !== NODE_DOCUMENT_VERSION ||
        protocol.baselineId !== baselineId ||
        protocol.epoch !== epoch ||
        protocol.revision !== prepared.expectedRevision ||
        !Number.isSafeInteger(protocol.sequence) ||
        protocol.sequence < 0
      )
        throw new Error("CONTENT_VERSION_CONFLICT: 共享正文已变化，请重新读取");
      expiresAt = this.client.serverTime(serverUrl) + 4 * 60_000;
    } catch (error) {
      if (session.info.source === observedSource && !session.doc.isDestroyed)
        this.store.db.transaction(saveCandidate)();
      throw error;
    }

    const record: ReplacementRecord = {
      roomId: documentId,
      serverUrl,
      source: {
        databaseName: source.databaseName,
        librarySourceId: source.librarySourceId,
        contentId: source.contentId,
        contentCreatedAt: source.contentCreatedAt,
        contentDocumentId: source.contentDocumentId,
      },
      actorId,
      intentHash: prepared.intentHash,
      request: {
        operationId: prepared.operationId,
        baselineId,
        epoch,
        version: NODE_DOCUMENT_VERSION,
        expectedRevision: prepared.expectedRevision,
        expectedSequence: protocol.sequence,
        updateHash: digest(prepared.update),
        expiresAt,
      },
    };
    this.assertRecord(session, record);
    this.store.db.transaction(() => {
      const earlier = this.read(session);
      if (earlier && !earlier.outcome) throw pending(earlier.request.operationId);
      saveCandidate();
      this.save(record);
    })();

    await this.run(record, async () => {
      let operation: DocumentOperation | null;
      try {
        ({ operation } = await this.client.request<{ operation: DocumentOperation | null }>(
          serverUrl,
          operationRoute(record),
          "POST",
          { ...record.request, update: Buffer.from(prepared.update).toString("base64") }
        ));
      } catch {
        operation = await this.lookup(session, record);
      }
      await this.settle(session, record, operation, checkScope, onAccepted);
    });
  }

  private run(record: ReplacementRecord, apply: () => Promise<void>): Promise<void> {
    const id = record.request.operationId;
    const current = this.inFlight.get(id);
    if (current) return current;
    const operation = apply().finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, operation);
    return operation;
  }

  private read(session: RuntimeSession): ReplacementRecord | null {
    return this.store.get(
      settingKey(
        session.info.serverUrl,
        session.info.id,
        readDocumentIdentity(session.doc).baselineId
      ),
      null
    );
  }

  private save(record: ReplacementRecord): void {
    this.store.set(settingKey(record.serverUrl, record.roomId, record.request.baselineId), record);
  }

  private assertRecord(session: RuntimeSession, record: ReplacementRecord): void {
    const source = this.assertSession(session);
    const identity = readDocumentIdentity(session.doc);
    if (
      session.info.serverUrl !== record.serverUrl ||
      identity.documentId !== record.roomId ||
      identity.version !== record.request.version ||
      identity.baselineId !== record.request.baselineId ||
      identity.epoch !== record.request.epoch ||
      !matchesSource(source, record.source)
    )
      throw new Error("CONTENT_VERSION_CONFLICT: 共享正文身份已变化，原候选已保留");
  }

  private async lookup(session: RuntimeSession, record: ReplacementRecord) {
    this.assertRecord(session, record);
    if ((await this.client.identity(record.serverUrl)).id !== record.actorId)
      throw new Error("FORBIDDEN: 协作设备已变化，原候选已保留");
    let operation: DocumentOperation | null;
    try {
      ({ operation } = await this.client.request<{ operation: DocumentOperation | null }>(
        record.serverUrl,
        operationRoute(record)
      ));
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403)
        throw new Error("FORBIDDEN: 共享正文权限已变化，原候选已保留");
      throw pending(record.request.operationId);
    }
    this.assertRecord(session, record);
    return operation;
  }

  private async settle(
    session: RuntimeSession,
    record: ReplacementRecord,
    operation: DocumentOperation | null,
    checkScope?: () => void,
    onAccepted?: () => void
  ): Promise<void> {
    const request = record.request;
    const check = () => {
      checkScope?.();
      this.assertRecord(session, record);
    };
    check();
    if (
      operation &&
      (operation.documentId !== record.roomId ||
        operation.actorId !== record.actorId ||
        operation.operationId !== request.operationId ||
        operation.kind !== undefined ||
        operation.version !== request.version ||
        operation.expectedRevision !== request.expectedRevision ||
        operation.expectedSequence !== request.expectedSequence ||
        operation.baselineId !== request.baselineId ||
        operation.epoch !== request.epoch ||
        operation.updateHash !== request.updateHash ||
        operation.expiresAt !== request.expiresAt)
    )
      throw new Error("共享正文回执指纹不匹配，原候选已保留");
    if (record.outcome?.state === "COMMITTED" && operation?.state !== "COMMITTED")
      throw new Error("共享正文提交回执已变化，原结果已保留");
    if (operation?.state === "PENDING" || (!operation && this.beforeDeadline(record)))
      throw pending(request.operationId);
    if (!operation || operation.state === "ABORTED" || operation.state === "EXPIRED") {
      const state = operation?.state === "ABORTED" ? "ABORTED" : "EXPIRED";
      const reason = operation?.reason ?? "deadline";
      this.save({ ...record, outcome: { state, reason } });
      throw new Error(`CONTENT_VERSION_CONFLICT: 共享修改未提交，原候选已保留 (${reason})`);
    }
    const receipt = operation.receipt;
    if (
      operation.state !== "COMMITTED" ||
      !receipt ||
      receipt.documentId !== record.roomId ||
      receipt.baselineId !== request.baselineId ||
      receipt.epoch !== request.epoch ||
      !Number.isSafeInteger(receipt.sequence) ||
      receipt.sequence < request.expectedSequence ||
      receipt.sequence > request.expectedSequence + 1 ||
      !/^[a-f0-9]{64}$/.test(receipt.revision)
    )
      throw new Error("共享正文提交回执无效，原候选已保留");
    if (record.outcome?.state === "COMMITTED") {
      if (
        record.outcome.receipt.revision !== receipt.revision ||
        record.outcome.receipt.sequence !== receipt.sequence
      )
        throw new Error("共享正文提交回执已变化，原结果已保留");
      return;
    }
    let authoritative: DocumentStateResponse;
    try {
      authoritative = await this.client.request<DocumentStateResponse>(
        record.serverUrl,
        `${documentRoute(record.roomId)}/state`,
        "GET",
        undefined,
        request.version
      );
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403)
        throw new Error("FORBIDDEN: 共享正文权限已变化，原候选已保留");
      throw pending(request.operationId);
    }
    check();
    const { protocol, state } = authoritative;
    const bytes = Buffer.from(state, "base64");
    if (
      protocol.id !== record.roomId ||
      protocol.version !== request.version ||
      protocol.epoch !== request.epoch ||
      protocol.baselineId !== request.baselineId ||
      !Number.isSafeInteger(protocol.sequence) ||
      protocol.sequence < receipt.sequence ||
      (protocol.sequence === receipt.sequence && protocol.revision !== receipt.revision) ||
      digest(bytes) !== protocol.revision
    )
      throw new Error("共享正文确认快照与操作回执不匹配，原候选已保留");
    await this.updates.apply(
      session,
      {
        authoritative: true,
        bytes: bytes.byteLength,
        build: async () => bytes,
        commit: () => {
          this.save({ ...record, outcome: { state: "COMMITTED", receipt } });
          this.drafts.db
            .prepare("UPDATE document_drafts SET applied=1 WHERE view_id=? AND applied=0")
            .run(sharedReplacementDraftId(request.operationId));
        },
      },
      check,
      onAccepted
    );
  }

  private beforeDeadline(record: ReplacementRecord): boolean {
    try {
      return this.client.serverTime(record.serverUrl) < record.request.expiresAt;
    } catch {
      return true;
    }
  }
}
