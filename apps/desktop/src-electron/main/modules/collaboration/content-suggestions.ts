import type Database from "better-sqlite3";
import type { ScopedContentEdit, ScopedContentEdits } from "@tau/collaboration";
import {
  SUGGESTION_HISTORY_MS,
  type ContentQuestionRequest,
  type ContentSuggestion,
  type ContentSuggestionBatch,
  type ContentSuggestionKind,
  type ContentSuggestionMode,
  type ContentSuggestionQuery,
  type ContentSuggestionStatus,
} from "@/types/content-suggestion";

interface Row {
  id: string;
  workspace_id: string;
  content_id: number;
  document_id: string;
  baseline_id: string;
  epoch: number;
  proposal_id: string;
  conversation_key: string;
  agent_id: string | null;
  agent_label: string | null;
  sequence: number;
  kind: ContentSuggestionKind;
  mode: ContentSuggestionMode;
  edit: string;
  contracts: string | null;
  before_text: string;
  after_text: string;
  reason: string | null;
  options: string | null;
  status: ContentSuggestionStatus;
  inverse: string | null;
  feedback: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

type TextEdit = Extract<ScopedContentEdit, { kind: "text" }>;

/** 已处理的建议保留 30 天供对话回看与撤销，之后清理。 */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 256;
/** 正文视图一次最多取回的条目（待处理全量 + 近期已处理） */
const CONTENT_VIEW_LIMIT = 300;

/** 逐段落地的直接改会留下多段逆操作；合成一段覆盖全部新文字的范围，供正文标出「刚改过」。 */
const appliedRange = (inverse: ScopedContentEdits | undefined): ScopedContentEdit | undefined => {
  const edits = inverse?.edits;
  if (!edits?.length) return undefined;
  const [first] = edits;
  if (
    edits.length === 1 ||
    first.kind !== "text" ||
    edits.some(edit => edit.kind !== "text" || edit.blockId !== first.blockId)
  )
    return first;
  const texts = edits as TextEdit[];
  return {
    ...first,
    end: texts[texts.length - 1].end,
    expected: texts.flatMap(edit => edit.expected),
    text: texts.map(edit => edit.text).join(""),
  };
};

const toSuggestion = (row: Row): ContentSuggestion => {
  const applied = appliedRange(
    row.inverse ? (JSON.parse(row.inverse) as ScopedContentEdits) : undefined
  );
  return {
    id: row.id,
    contentId: row.content_id,
    documentId: row.document_id,
    baselineId: row.baseline_id,
    epoch: row.epoch,
    proposalId: row.proposal_id,
    conversationKey: row.conversation_key,
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.agent_label ? { agentLabel: row.agent_label } : {}),
    sequence: row.sequence,
    kind: row.kind,
    mode: row.mode,
    edit: JSON.parse(row.edit) as ScopedContentEdit,
    ...(applied ? { applied } : {}),
    beforeText: row.before_text,
    afterText: row.after_text,
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.options ? { options: JSON.parse(row.options) as string[] } : {}),
    status: row.status,
    ...(row.feedback ? { feedback: row.feedback } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/** 同时作为范围操作身份，须满足操作 ID 字符集；重送同一条即复用原回执。 */
const suggestionId = (proposalId: string, sequence: number) => `${proposalId}.${sequence}`;

const INSERT = `INSERT INTO content_suggestions (id,workspace_id,content_id,document_id,baseline_id,epoch,proposal_id,conversation_key,agent_id,agent_label,sequence,kind,mode,edit,contracts,before_text,after_text,reason,options,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`;

/**
 * 建议记录：每处改动一行，所有窗口经主进程读写同一份。
 * 状态迁移全部是带前置状态的条件更新，两个视图同时操作时先到先得。
 */
export class ContentSuggestionStore {
  constructor(private readonly db: Database.Database) {}

  create(workspaceId: string, contentId: number, batch: ContentSuggestionBatch, at = Date.now()) {
    if (!batch.items.length || batch.items.length > MAX_ITEMS) throw new Error("建议条数无效");
    const insert = this.db.prepare(INSERT);
    const contracts = batch.contracts ? JSON.stringify(batch.contracts) : null;
    this.db.transaction(() => {
      // 同一对话对同一正文的新提案替换旧的未处理与已过期改动，避免两轮改法叠在一起
      this.db
        .prepare(
          `UPDATE content_suggestions SET status='superseded',updated_at=? WHERE workspace_id=? AND content_id=? AND conversation_key=? AND kind='edit' AND status IN ('pending','expired') AND proposal_id<>?`
        )
        .run(at, workspaceId, contentId, batch.conversationKey, batch.proposalId);
      batch.items.forEach((item, sequence) =>
        insert.run(
          suggestionId(batch.proposalId, sequence),
          workspaceId,
          contentId,
          batch.baseline.documentId,
          batch.baseline.baselineId,
          batch.baseline.epoch,
          batch.proposalId,
          batch.conversationKey,
          batch.agentId ?? null,
          batch.agentLabel ?? null,
          sequence,
          "edit",
          batch.mode ?? "suggest",
          JSON.stringify(item.edit),
          contracts,
          item.beforeText,
          item.afterText,
          item.reason?.trim() || null,
          null,
          at,
          at
        )
      );
      this.prune(workspaceId, at);
    })();
  }

  createQuestion(workspaceId: string, contentId: number, request: ContentQuestionRequest) {
    const at = Date.now();
    this.db.transaction(() => {
      this.db
        .prepare(INSERT)
        .run(
          suggestionId(request.proposalId, 0),
          workspaceId,
          contentId,
          request.baseline.documentId,
          request.baseline.baselineId,
          request.baseline.epoch,
          request.proposalId,
          request.conversationKey,
          request.agentId ?? null,
          request.agentLabel ?? null,
          0,
          "question",
          "suggest",
          JSON.stringify(request.anchor),
          null,
          request.quote,
          "",
          request.question.trim(),
          JSON.stringify(request.options),
          at,
          at
        );
      this.prune(workspaceId, at);
    })();
    return suggestionId(request.proposalId, 0);
  }

  /** 直接改让出时，剩下的文字转成同一提案里的一条待处理条目（接在已落地文字之后，接受即接着改）。 */
  createRemainder(row: Row, edit: ScopedContentEdit, afterText: string, at = Date.now()) {
    const { value } = this.db
      .prepare("SELECT MAX(sequence) AS value FROM content_suggestions WHERE proposal_id=?")
      .get(row.proposal_id) as { value: number | null };
    const sequence = (value ?? row.sequence) + 1;
    const id = suggestionId(row.proposal_id, sequence);
    this.db
      .prepare(INSERT)
      .run(
        id,
        row.workspace_id,
        row.content_id,
        row.document_id,
        row.baseline_id,
        row.epoch,
        row.proposal_id,
        row.conversation_key,
        row.agent_id,
        row.agent_label,
        sequence,
        "edit",
        "direct",
        JSON.stringify(edit),
        row.contracts,
        "",
        afterText,
        row.reason,
        null,
        at,
        at
      );
    return id;
  }

  private prune(workspaceId: string, at: number) {
    this.db
      .prepare(
        `DELETE FROM content_suggestions WHERE workspace_id=? AND status NOT IN ('pending','applying') AND updated_at<?`
      )
      .run(workspaceId, at - RETENTION_MS);
  }

  list(workspaceId: string, query: ContentSuggestionQuery): ContentSuggestion[] {
    if (query.suggestionId !== undefined) {
      const row = this.db
        .prepare("SELECT * FROM content_suggestions WHERE workspace_id=? AND content_id=? AND id=?")
        .get(workspaceId, query.contentId ?? -1, query.suggestionId) as Row | undefined;
      return row ? [toSuggestion(row)] : [];
    }
    if (query.proposalId)
      return (
        this.db
          .prepare(
            "SELECT * FROM content_suggestions WHERE workspace_id=? AND proposal_id=? ORDER BY sequence"
          )
          .all(workspaceId, query.proposalId) as Row[]
      ).map(toSuggestion);
    const rows = this.db
      .prepare(
        `SELECT * FROM content_suggestions WHERE workspace_id=? AND content_id=? AND (status IN ('pending','applying','expired') OR (status IN ('accepted','rejected','answered','undone') AND updated_at>=?)) ORDER BY updated_at DESC LIMIT ${CONTENT_VIEW_LIMIT}`
      )
      .all(workspaceId, query.contentId ?? -1, Date.now() - SUGGESTION_HISTORY_MS) as Row[];
    return rows
      .sort((a, b) => a.created_at - b.created_at || a.sequence - b.sequence)
      .map(toSuggestion);
  }

  /** 待处理的改动行：主进程据此按当前正文校验锚点与原文前提。 */
  pendingAnchors(workspaceId: string, contentId: number) {
    return this.db
      .prepare(
        "SELECT * FROM content_suggestions WHERE workspace_id=? AND content_id=? AND status='pending'"
      )
      .all(workspaceId, contentId) as Row[];
  }

  /** 取出可提交的建议并原子地置为 applying；已被另一视图处理的不返回。 */
  claim(workspaceId: string, ids: string[], contentId: number, at = Date.now()) {
    const select = this.db.prepare(
      "SELECT * FROM content_suggestions WHERE workspace_id=? AND id=? AND content_id=? AND kind='edit' AND status IN ('pending','applying')"
    );
    const update = this.db.prepare(
      "UPDATE content_suggestions SET status='applying',error=NULL,updated_at=? WHERE id=?"
    );
    return this.db.transaction(() =>
      ids.flatMap(id => {
        const row = select.get(workspaceId, id, contentId) as Row | undefined;
        if (!row) return [];
        update.run(at, id);
        return [{ row, contracts: row.contracts ? JSON.parse(row.contracts) : undefined }];
      })
    )();
  }

  settle(
    id: string,
    status: Extract<ContentSuggestionStatus, "pending" | "accepted" | "expired" | "applying">,
    detail: { inverse?: ScopedContentEdit[]; error?: string; afterText?: string } = {},
    at = Date.now()
  ) {
    return (
      this.db
        .prepare(
          "UPDATE content_suggestions SET status=?,inverse=COALESCE(?,inverse),after_text=COALESCE(?,after_text),error=?,updated_at=? WHERE id=? AND status='applying'"
        )
        .run(
          status,
          detail.inverse?.length ? JSON.stringify({ edits: detail.inverse }) : null,
          detail.afterText ?? null,
          detail.error ?? null,
          at,
          id
        ).changes > 0
    );
  }

  /** 已落地部分与接续建议在同一事务中完成，重试只会生成一条剩余建议。 */
  finishYielded(
    row: Row,
    typed: string,
    inverse: ScopedContentEdit[],
    remainder?: { edit: ScopedContentEdit; text: string }
  ) {
    return this.db.transaction(() => {
      if (!this.settle(row.id, "accepted", { inverse, afterText: typed })) return;
      if (remainder) return this.createRemainder(row, remainder.edit, remainder.text);
    })();
  }

  /** pending → rejected；带意见时记下，供 Agent 只重做这一条。 */
  reject(workspaceId: string, ids: string[], feedback?: string, at = Date.now()) {
    const update = this.db.prepare(
      "UPDATE content_suggestions SET status='rejected',feedback=?,updated_at=? WHERE workspace_id=? AND id=? AND status IN ('pending','expired')"
    );
    return this.db.transaction(() =>
      ids.filter(id => update.run(feedback?.trim() || null, at, workspaceId, id).changes > 0)
    )();
  }

  /** 原文已变，锚点或前提对不上：pending → expired。 */
  expire(ids: string[], error: string, at = Date.now()) {
    const update = this.db.prepare(
      "UPDATE content_suggestions SET status='expired',error=?,updated_at=? WHERE id=? AND status='pending'"
    );
    return this.db.transaction(() => ids.filter(id => update.run(error, at, id).changes > 0))();
  }

  /** 提问作答：pending → answered，回答记在 feedback。 */
  answer(workspaceId: string, id: string, answer: string, at = Date.now()) {
    return (
      this.db
        .prepare(
          "UPDATE content_suggestions SET status='answered',feedback=?,updated_at=? WHERE workspace_id=? AND id=? AND kind='question' AND status='pending'"
        )
        .run(answer.trim(), at, workspaceId, id).changes > 0
    );
  }

  supersede(workspaceId: string, proposalId: string, at = Date.now()) {
    return this.db
      .prepare(
        "UPDATE content_suggestions SET status='superseded',updated_at=? WHERE workspace_id=? AND proposal_id=? AND status IN ('pending','expired')"
      )
      .run(at, workspaceId, proposalId).changes;
  }

  /** 取出可撤销的已接受建议（含逆操作），撤销成功后由 markUndone 落状态。 */
  undoable(workspaceId: string, ids: string[]) {
    const select = this.db.prepare(
      "SELECT * FROM content_suggestions WHERE workspace_id=? AND id=? AND status='accepted' AND inverse IS NOT NULL"
    );
    return ids.flatMap(id => {
      const row = select.get(workspaceId, id) as Row | undefined;
      return row ? [row] : [];
    });
  }

  markUndone(id: string, at = Date.now()) {
    this.db
      .prepare(
        "UPDATE content_suggestions SET status='undone',updated_at=? WHERE id=? AND status='accepted'"
      )
      .run(at, id);
  }

  row(id: string) {
    return this.db.prepare("SELECT * FROM content_suggestions WHERE id=?").get(id) as
      | Row
      | undefined;
  }

  suggestion(id: string) {
    const row = this.row(id);
    return row && toSuggestion(row);
  }
}

export type { Row as ContentSuggestionRow };
