import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  buildScopedContentUpdate,
  readDocumentIdentity,
  readNodeDocument,
  ScopedContentConflictError,
  ScopedUndoLimitError,
  validateScopedContentEdits,
  type ScopedContentEdits,
  type ScopedContentResult,
  type ScopedContentSubmission,
} from "@tau/collaboration";
import { MAIN_AGENT_NAME } from "@/services/agent-identity";
import { CONTENT_AGENT_PRESENCE_CHANGED } from "@/types/agent-presence";
import { broadcastDatabaseChange } from "../../database-notifications";
import { contentRevision, contentSession } from "../../collaboration/content-sessions";
import type { RuntimeSession } from "../../collaboration/types";
import type { ContentSessionManager } from "..";
import { AgentPermissionStore } from "./agent-permissions";
import { AgentPresenceHub } from "./agent-presence";
import type { TypingHost } from "./agent-typing";
import { ContentSuggestionStore, type ContentSuggestionRow } from "./content-suggestions";
import { ContentSuggestionService, type ScopedWriteOptions } from "./suggestion-service";

type ReadSharedState = (session: RuntimeSession) => Promise<Uint8Array>;
type SubmitSharedEdit = (
  session: RuntimeSession,
  request: ScopedContentSubmission,
  updateHash: string,
  check: () => void,
  options: ScopedWriteOptions
) => Promise<ScopedContentResult>;

const receiptKey = (request: Omit<ScopedContentSubmission, "scope">) =>
  `scoped-edit:${request.documentId}:${request.baselineId}:${request.epoch}:${request.operationId}`;

export class ContentAgent {
  readonly permissions: AgentPermissionStore;
  readonly suggestions: ContentSuggestionService;
  readonly presence: AgentPresenceHub;

  constructor(
    db: Database.Database,
    private readonly host: Pick<
      ContentSessionManager,
      "openForDatabase" | "acceptUpdates" | "save" | "reportSaveFailure"
    >,
    findContent: (workspaceId: string, contentId: number) => RuntimeSession | undefined,
    broadcastPresence: (documentId: string, update: Uint8Array) => void,
    private readonly readSharedState: ReadSharedState,
    private readonly submitSharedEdit: SubmitSharedEdit
  ) {
    this.permissions = new AgentPermissionStore(db);
    this.suggestions = new ContentSuggestionService(
      new ContentSuggestionStore(db),
      this.applyScopedEdit.bind(this),
      this.typingHost.bind(this),
      (database, contentId) => contentSession(database, contentId)?.doc,
      this.permissions.level.bind(this.permissions)
    );
    this.presence = new AgentPresenceHub({
      doc: (workspaceId, contentId) => {
        const session = findContent(workspaceId, contentId);
        return session && { documentId: session.info.id, doc: session.doc };
      },
      broadcastAwareness: broadcastPresence,
      changed: (workspaceId, contentId) =>
        broadcastDatabaseChange(CONTENT_AGENT_PRESENCE_CHANGED, workspaceId, { contentId }),
    });
  }

  private async openSession(db: Database.Database, contentId: number) {
    if (!contentSession(db, contentId)) await this.host.openForDatabase(db, contentId);
    return contentSession(db, contentId);
  }

  async readEditSnapshot(db: Database.Database, contentId: number) {
    const session = await this.openSession(db, contentId);
    if (!session) throw new Error("正文会话未就绪");
    const identity = readDocumentIdentity(session.doc);
    const candidate = new Y.Doc({ gc: false });
    try {
      if (session.info.mode !== "local") {
        Y.applyUpdate(candidate, await this.readSharedState(session));
        const confirmed = readDocumentIdentity(candidate);
        if (
          confirmed.documentId !== identity.documentId ||
          confirmed.epoch !== identity.epoch ||
          confirmed.baselineId !== identity.baselineId
        )
          throw new Error("DOCUMENT_CHANGED: 正文基线已变化，请重新读取");
      }
      if (contentSession(db, contentId) !== session) throw new Error("正文会话已变化");
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(session.doc));
      return {
        content: readNodeDocument(candidate).content,
        state: Y.encodeStateAsUpdate(candidate),
        identity,
        revision: contentRevision(session),
      };
    } finally {
      candidate.destroy();
    }
  }

  async applyScopedEdit(
    db: Database.Database,
    contentId: number,
    request: ScopedContentSubmission,
    options: ScopedWriteOptions = {}
  ): Promise<ScopedContentResult> {
    options.assertCanWrite?.();
    validateScopedContentEdits(request.scope);
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(request.operationId)) throw new Error("编辑操作 ID 无效");
    const session = await this.openSession(db, contentId);
    if (!session) return { status: "rejected", reason: "DOCUMENT_CHANGED" };
    const check = () => {
      options.assertCanWrite?.();
      const identity = readDocumentIdentity(session.doc);
      if (
        session.info.frozen ||
        session.info.leaving ||
        session.info.status !== "active" ||
        contentSession(db, contentId) !== session ||
        identity.documentId !== request.documentId ||
        identity.baselineId !== request.baselineId ||
        identity.epoch !== request.epoch
      )
        throw new Error("DOCUMENT_CHANGED: 正文会话已变化，请重新读取");
    };
    check();
    const encoded = JSON.stringify(request.scope);
    const updateHash = createHash("sha256").update(encoded).digest("hex");
    if (session.info.mode !== "local")
      return this.submitSharedEdit(session, request, updateHash, check, options);
    const { undo } = options;
    const store = session.store;
    if (!store) throw new Error("正文日志尚未就绪");
    const key = receiptKey(request);
    let inverse: ScopedContentEdits | undefined;
    try {
      await this.host.acceptUpdates(
        session,
        {
          bytes: Buffer.byteLength(encoded),
          build: async () => {
            const previous = store.get<{
              hash: string;
              inverse?: ScopedContentEdits;
            } | null>(key, null);
            if (previous) {
              if (previous.hash !== updateHash) throw new Error("操作身份已被另一请求使用");
              inverse = previous.inverse;
              return null;
            }
            const prepared = await buildScopedContentUpdate(session.doc, request.scope, { undo });
            inverse = prepared.inverse;
            return prepared.update;
          },
          commit: () => store.set(key, { hash: updateHash, inverse }),
        },
        check
      );
    } catch (error) {
      if (error instanceof ScopedContentConflictError)
        return { status: "conflict", conflicts: error.conflicts };
      if (error instanceof ScopedUndoLimitError) return { status: "rejected", reason: error.code };
      throw error;
    }
    void this.host.save(session).catch(error => this.host.reportSaveFailure(session, error));
    return { status: "committed", inverse };
  }

  /** 直接改的落地环境：正文会话（没打开就先打开）、按块检查有没有人在编辑、光标随写随走 */
  private async typingHost(
    db: Database.Database,
    contentId: number,
    row: ContentSuggestionRow
  ): Promise<TypingHost | undefined> {
    const workspaceId = basename(db.name, ".db");
    const session = await this.openSession(db, contentId);
    if (!session) return undefined;
    const agent = row.agent_label ?? MAIN_AGENT_NAME;
    return {
      local: session.info.mode === "local",
      session: () => {
        const current = contentSession(db, contentId);
        return current && { doc: current.doc, awareness: current.awareness };
      },
      submit: (request, assertCanWrite) =>
        this.applyScopedEdit(db, contentId, request, { assertCanWrite }),
      receipt: operationId => {
        const result = session.store?.get<{ inverse?: ScopedContentEdits } | null>(
          receiptKey({
            documentId: row.document_id,
            baselineId: row.baseline_id,
            epoch: row.epoch,
            operationId,
          }),
          null
        );
        return result ? { status: "committed", inverse: result.inverse } : undefined;
      },
      moved: caret =>
        this.presence.set(workspaceId, contentId, {
          agent,
          owner: row.conversation_key,
          status: "busy",
          action: "正在改这段",
          caret,
          block: caret.blockId,
          editing: true,
        }),
      delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
    };
  }

  /** 视图订阅时的完整在场：会话里各视图的状态 + 这篇正文上 Agent 的状态 */
  presenceSnapshot(session: RuntimeSession) {
    const keys = [...session.awareness.getStates().keys()];
    const source = session.info.source;
    const agents = source
      ? this.presence.updates(source.databaseName.replace(/\.db$/, ""), source.contentId)
      : [];
    if (!agents.length) return encodeAwarenessUpdate(session.awareness, keys);
    const merged = new Awareness(new Y.Doc());
    try {
      merged.setLocalState(null);
      applyAwarenessUpdate(merged, encodeAwarenessUpdate(session.awareness, keys), "snapshot");
      for (const update of agents) applyAwarenessUpdate(merged, update, "snapshot");
      return encodeAwarenessUpdate(merged, [...merged.getStates().keys()]);
    } finally {
      merged.destroy();
      merged.doc.destroy();
    }
  }

  dispose() {
    this.suggestions.dispose();
    this.presence.dispose();
  }
}
