import type Database from "better-sqlite3";
import { basename } from "node:path";
import * as Y from "yjs";
import {
  readDocumentIdentity,
  scopedEditsApplicable,
  scopedUndoOperationId,
  ScopedUndoLimitError,
  type ScopedContentEdit,
  type ScopedContentResult,
  type ScopedContentSubmission,
} from "@tau/collaboration";
import {
  CONTENT_SUGGESTION_FOLLOW_UP,
  CONTENT_SUGGESTIONS_CHANGED,
  type ContentQuestionRequest,
  type ContentSuggestion,
  type ContentSuggestionBatch,
  type ContentSuggestionAcceptOptions,
  type AgentPermissionLevel,
  type ContentSuggestionQuery,
} from "@/types/content-suggestion";
import { broadcastDatabaseChange } from "../../database-notifications";
import { ContentSuggestionStore, type ContentSuggestionRow } from "./content-suggestions";
import { agentEditSignal } from "../../agent-run-events";
import { canType, humanEditing, typeEdit, type TypingHost } from "./agent-typing";

export interface ScopedWriteOptions {
  assertCanWrite?: () => void;
  signal?: AbortSignal;
  undo?: boolean;
}

type ApplyScoped = (
  db: Database.Database,
  contentId: number,
  request: ScopedContentSubmission,
  options?: ScopedWriteOptions
) => Promise<ScopedContentResult>;

/** 直接改的落地环境：会话、光标上报；由正文会话按需提供 */
export type TypingHostFactory = (
  db: Database.Database,
  contentId: number,
  row: ContentSuggestionRow
) => Promise<TypingHost | undefined>;

export interface SuggestionOutcome {
  id: string;
  status: ContentSuggestion["status"];
  error?: string;
}

const workspaceOf = (db: Database.Database) => basename(db.name, ".db");
/** 正文连续输入时合并校验，停顿后再按当前正文核对待处理建议 */
const VALIDATE_DELAY_MS = 400;
const CHANGED_TEXT = "原文已变化";
const YIELDED_TEXT = "你正在编辑这段，它先停下了";

const blockOf = (edit: ScopedContentEdit) =>
  edit.kind === "text" ? edit.blockId : (edit.expected[0]?.collabId ?? edit.left ?? edit.right);

/** 建议的提交、退回与撤销；每条独立校验，一条过期不影响其他条。 */
export class ContentSuggestionService {
  private readonly inFlight = new Set<string>();
  private readonly validations = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly store: ContentSuggestionStore,
    private readonly applyScoped: ApplyScoped,
    private readonly typing?: TypingHostFactory,
    private readonly currentDocument?: (
      db: Database.Database,
      contentId: number
    ) => Y.Doc | undefined,
    private readonly permission?: (
      db: Database.Database,
      contentId: number,
      agent: string
    ) => AgentPermissionLevel
  ) {}

  private changed(workspaceId: string, contentId: number, proposalIds: Iterable<string>) {
    broadcastDatabaseChange(CONTENT_SUGGESTIONS_CHANGED, workspaceId, {
      contentId,
      proposalIds: [...new Set(proposalIds)],
    });
  }

  list(db: Database.Database, query: ContentSuggestionQuery) {
    return this.store.list(workspaceOf(db), query);
  }

  create(db: Database.Database, contentId: number, batch: ContentSuggestionBatch) {
    const workspaceId = workspaceOf(db);
    this.store.create(workspaceId, contentId, batch);
    this.changed(workspaceId, contentId, [batch.proposalId]);
    return this.store.list(workspaceId, { proposalId: batch.proposalId });
  }

  createQuestion(db: Database.Database, contentId: number, request: ContentQuestionRequest) {
    const workspaceId = workspaceOf(db);
    const id = this.store.createQuestion(workspaceId, contentId, request);
    this.changed(workspaceId, contentId, [request.proposalId]);
    const created = this.store.suggestion(id);
    if (!created) throw new Error("提问记录写入失败");
    return created;
  }

  answer(db: Database.Database, contentId: number, id: string, answer: string) {
    if (!answer.trim()) throw new Error("回答不能为空");
    const workspaceId = workspaceOf(db);
    const row = this.store.row(id);
    if (!row || row.workspace_id !== workspaceId || row.content_id !== contentId) return false;
    const current = this.currentDocument?.(db, contentId);
    if (current) this.validate(workspaceId, contentId, current);
    const answered = this.store.answer(workspaceId, id, answer);
    if (answered && row) this.changed(workspaceId, contentId, [row.proposal_id]);
    return answered;
  }

  /**
   * 接受（提交）条目。直接改（mode=direct）的条目先看有没有人正在编辑那一块，有就整条留给用户；
   * typing 时本机正文逐段打字，中途有人进来就停手，剩下的转成一条待处理条目。
   */
  async accept(
    db: Database.Database,
    contentId: number,
    ids: string[],
    options: ContentSuggestionAcceptOptions = {}
  ) {
    const workspaceId = workspaceOf(db);
    const outcomes: SuggestionOutcome[] = [];
    const proposals = new Set<string>();
    const signal =
      options.executionId === undefined ? undefined : agentEditSignal(options.executionId);
    signal?.throwIfAborted();
    const claimed = this.store.claim(
      workspaceId,
      [...new Set(ids)].filter(id => !this.inFlight.has(id)),
      contentId
    );
    for (const { row } of claimed) this.inFlight.add(row.id);
    try {
      for (const { row, contracts } of claimed) {
        proposals.add(row.proposal_id);
        const edit = JSON.parse(row.edit) as ScopedContentEdit;
        const base = { documentId: row.document_id, baselineId: row.baseline_id, epoch: row.epoch };
        const scope = {
          ...(contracts ? { contracts } : {}),
          source: {
            proposalId: row.proposal_id,
            ...(row.agent_id ? { agentId: row.agent_id } : {}),
          },
        };
        let result: ScopedContentResult;
        let startedTyping = false;
        let revoked = false;
        try {
          const agent = row.agent_label ?? "助手";
          const initial = signal && this.permission?.(db, contentId, agent);
          const assertCanWrite = () => {
            signal?.throwIfAborted();
            if (!signal || !this.permission) return;
            const level = this.permission(db, contentId, agent);
            if (
              initial === "readonly" ||
              level === "readonly" ||
              ((options.requireDirectPermission || initial === "direct") && level !== "direct")
            ) {
              revoked = true;
              throw new Error("AGENT_PERMISSION_CHANGED");
            }
          };
          const host =
            row.mode === "direct" && this.typing
              ? await this.typing(db, contentId, row)
              : undefined;
          const session = host?.session();
          const block = blockOf(edit);
          const prior = host?.local ? host.receipt?.(row.id) : undefined;
          const recovering = row.status === "applying" && host?.receipt?.(`${row.id}.t0`);
          const typing =
            host?.local &&
            edit.kind === "text" &&
            (recovering || (canType(edit) && (options.typing || row.status === "applying")));
          if (prior) {
            result = prior;
          } else if (typing && host && edit.kind === "text") {
            startedTyping = true;
            const typed = await typeEdit(edit, base, scope, row.id, host, signal, assertCanWrite);
            if (typed.status === "accepted") {
              this.store.settle(row.id, "accepted", { inverse: typed.inverse });
              outcomes.push({ id: row.id, status: "accepted" });
              continue;
            }
            if (typed.status === "yielded") {
              const error = revoked
                ? "Agent 的直接修改权限已撤回"
                : signal?.aborted
                  ? "Agent 已停止"
                  : YIELDED_TEXT;
              if (!typed.typed) {
                this.store.settle(row.id, "pending", { error });
                outcomes.push({ id: row.id, status: "pending", error });
                continue;
              }
              const rest = this.store.finishYielded(
                row,
                typed.typed,
                typed.inverse,
                typed.remainder
              );
              outcomes.push({ id: row.id, status: "accepted" });
              if (rest) outcomes.push({ id: rest, status: "pending", error });
              continue;
            }
            result =
              typed.status === "failed"
                ? typed.result
                : await this.applyScoped(
                    db,
                    contentId,
                    {
                      ...base,
                      operationId: row.id,
                      scope: { ...scope, edits: [edit] },
                    },
                    { assertCanWrite, signal }
                  );
          } else if (
            session &&
            block &&
            row.status !== "applying" &&
            humanEditing(session, block)
          ) {
            this.store.settle(row.id, "pending", { error: YIELDED_TEXT });
            outcomes.push({ id: row.id, status: "pending", error: YIELDED_TEXT });
            continue;
          } else {
            result = await this.applyScoped(
              db,
              contentId,
              {
                ...base,
                operationId: row.id,
                scope: { ...scope, edits: [edit] },
              },
              { assertCanWrite, signal }
            );
          }
        } catch (error) {
          const message = revoked
            ? "Agent 的直接修改权限已撤回"
            : error instanceof Error
              ? error.message
              : String(error);
          // 正文身份变化后这条建议的锚点已失效；其他异常退回待处理，可再次接受
          const expired = message.startsWith("DOCUMENT_CHANGED");
          const status =
            startedTyping || (!expired && row.status === "applying")
              ? "applying"
              : expired
                ? "expired"
                : "pending";
          this.store.settle(row.id, status, { error: message });
          outcomes.push({ id: row.id, status, error: message });
          continue;
        }
        if (result.status === "committed") {
          this.store.settle(row.id, "accepted", { inverse: result.inverse?.edits });
          outcomes.push({ id: row.id, status: "accepted" });
        } else if (result.status === "pending") {
          this.store.settle(row.id, "applying", { error: "提交结果尚未确认" });
          outcomes.push({ id: row.id, status: "applying", error: "提交结果尚未确认" });
        } else {
          const error =
            result.status === "conflict"
              ? CHANGED_TEXT
              : result.reason === "cancelled"
                ? "Agent 已停止，提交已取消"
                : result.reason === ScopedUndoLimitError.code
                  ? ScopedUndoLimitError.description
                  : result.reason;
          this.store.settle(row.id, "expired", { error });
          outcomes.push({ id: row.id, status: "expired", error });
        }
      }
    } finally {
      for (const { row } of claimed) this.inFlight.delete(row.id);
      if (proposals.size) this.changed(workspaceId, contentId, proposals);
    }
    return outcomes;
  }

  reject(db: Database.Database, contentId: number, ids: string[], feedback?: string) {
    const workspaceId = workspaceOf(db);
    const rejected = this.store.reject(workspaceId, ids, feedback);
    const proposals = rejected.map(id => this.store.row(id)!.proposal_id);
    if (proposals.length) this.changed(workspaceId, contentId, proposals);
    return rejected;
  }

  supersede(db: Database.Database, contentId: number, proposalId: string) {
    const workspaceId = workspaceOf(db);
    if (this.store.supersede(workspaceId, proposalId))
      this.changed(workspaceId, contentId, [proposalId]);
  }

  /** 独立窗口里的跟进请求（如让 Agent 重写）转给持有对话的主窗口处理 */
  async followUp(db: Database.Database, request: Record<string, unknown>) {
    const [{ getMainWindows }, { default: database }] = await Promise.all([
      import("../../../windows"),
      import("../../database"),
    ]);
    const workspaceId = workspaceOf(db);
    const target = getMainWindows().find(
      window =>
        !window.isDestroyed() &&
        database.windowToDatabase.get(window.id)?.replace(/\.db$/, "") === workspaceId
    );
    if (!target) return false;
    target.webContents.send(CONTENT_SUGGESTION_FOLLOW_UP, {
      ...request,
      databaseName: workspaceId,
    });
    return true;
  }

  async undo(db: Database.Database, contentId: number, ids: string[]) {
    const workspaceId = workspaceOf(db);
    const outcomes: SuggestionOutcome[] = [];
    const proposals = new Set<string>();
    try {
      // 倒序撤销，后改的先回退，避免同块的前一处逆操作失去前提
      for (const row of this.store.undoable(workspaceId, ids).reverse()) {
        const inverse = JSON.parse(row.inverse!) as { edits: ScopedContentEdit[] };
        const result = await this.applyScoped(
          db,
          contentId,
          {
            documentId: row.document_id,
            baselineId: row.baseline_id,
            epoch: row.epoch,
            operationId: scopedUndoOperationId(row.id),
            scope: { ...inverse, source: { proposalId: row.proposal_id } },
          },
          { undo: true }
        );
        if (result.status === "committed") {
          this.store.markUndone(row.id);
          proposals.add(row.proposal_id);
          outcomes.push({ id: row.id, status: "undone" });
        } else
          outcomes.push({
            id: row.id,
            status: "accepted",
            error:
              result.status === "conflict" ? "改动范围已有后续编辑，未撤销" : "撤销结果尚未确认",
          });
      }
    } finally {
      if (proposals.size) this.changed(workspaceId, contentId, proposals);
    }
    return outcomes;
  }

  /**
   * 按当前正文核对待处理建议：正文换代、锚点解析不到或原文前提已变的转为过期，
   * 不画到错误位置，也不让 Agent 等一条已经不可能接受的建议。
   */
  validate(workspaceId: string, contentId: number, doc: Y.Doc) {
    const rows = this.store.pendingAnchors(workspaceId, contentId);
    if (!rows.length || doc.isDestroyed) return;
    const identity = readDocumentIdentity(doc);
    const current = rows.filter(
      row =>
        row.document_id === identity.documentId &&
        row.baseline_id === identity.baselineId &&
        row.epoch === identity.epoch
    );
    const applicable = scopedEditsApplicable(
      doc,
      current.map(row => JSON.parse(row.edit) as ScopedContentEdit)
    );
    const stale = [
      ...rows.filter(row => !current.includes(row)),
      ...current.filter((_, index) => !applicable[index]),
    ];
    if (!stale.length) return;
    const expired = new Set(
      this.store.expire(
        stale.map(row => row.id),
        CHANGED_TEXT
      )
    );
    if (expired.size)
      this.changed(
        workspaceId,
        contentId,
        stale.filter(row => expired.has(row.id)).map(row => row.proposal_id)
      );
  }

  /** 正文更新后合并校验；取文档的回调在触发时调用，会话已销毁时返回 undefined 即跳过。 */
  scheduleValidation(workspaceId: string, contentId: number, doc: () => Y.Doc | undefined) {
    const key = `${workspaceId}:${contentId}`;
    clearTimeout(this.validations.get(key));
    this.validations.set(
      key,
      setTimeout(() => {
        this.validations.delete(key);
        const current = doc();
        if (!current) return;
        try {
          this.validate(workspaceId, contentId, current);
        } catch (error) {
          console.warn("[content-suggestions] 校验待处理建议失败", error);
        }
      }, VALIDATE_DELAY_MS)
    );
  }

  dispose() {
    for (const timer of this.validations.values()) clearTimeout(timer);
    this.validations.clear();
  }
}
