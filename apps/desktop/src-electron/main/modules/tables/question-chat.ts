import Database from "better-sqlite3";
import type { QuestionChat, QuestionChatTarget } from "@/types";
import QuestionEventTable from "./question-event";
import QuestionTable from "./question";

interface ChatRow {
  id: number;
  question_id: number;
  session_id: string;
  message_ids: string | null;
  create_time: number;
  title: string | null;
  scope: string | null;
  message_count: number | null;
  update_time: number | null;
  initiated: number;
}

/** 对话场景：只有主对话能经对话页打开，其余随宿主（PDF / 视频笔记 / Notebook）打开 */
const SCOPE_META: Record<string, { label: string; openable: boolean }> = {
  "main-chat": { label: "", openable: true },
  "pdf-chat": { label: "PDF 对话", openable: false },
  "video-note-chat": { label: "视频笔记对话", openable: false },
  "vibe-learning-chat": { label: "Notebook 对话", openable: false },
};

const parseIds = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

/**
 * 问题的探究对话（question_chat，KL-040）：会话 id 是 UUID，不进 question_link 的整数列。
 * 弱引用：对话被删不级联，解析时 missing；关联 / 解除同样记轨迹，第一份关联让待探究转为探究中。
 */
export default class QuestionChatTable {
  static getListenEvents() {
    return {
      "question:link-chat": this.link.bind(this),
      "question:unlink-chat": this.unlink.bind(this),
    } as const;
  }

  static list(db: Database.Database, questionId: number): QuestionChat[] {
    const rows = db
      .prepare(
        `SELECT q.id, q.question_id, q.session_id, q.message_ids, q.create_time,
           s.title, s.scope, s.message_count, s.update_time,
           EXISTS (SELECT 1 FROM entity_lineage l
             WHERE l.src_kind = 'question' AND l.src_id = CAST(q.question_id AS TEXT)
               AND l.dst_kind = 'chat-session' AND l.dst_id = q.session_id
               AND l.relation = 'discussed_in') AS initiated
         FROM question_chat q LEFT JOIN chat_session s ON s.id = q.session_id
         WHERE q.question_id = ? ORDER BY q.create_time DESC, q.id DESC`
      )
      .all(questionId) as ChatRow[];
    return rows.map(row => {
      const scope = row.scope != null ? SCOPE_META[row.scope] : undefined;
      return {
        id: row.id,
        questionId: row.question_id,
        sessionId: row.session_id,
        messageIds: parseIds(row.message_ids),
        createTime: row.create_time,
        title: row.title || "未命名对话",
        scopeLabel: scope?.label ?? (row.scope ? "对话" : ""),
        messageCount: row.message_count ?? 0,
        updateTime: row.update_time ?? row.create_time,
        openable: row.scope != null && Boolean(scope?.openable),
        missing: row.scope == null,
        initiated: Boolean(row.initiated),
      };
    });
  }

  static countsByQuestion(db: Database.Database): Map<number, number> {
    const rows = db
      .prepare(`SELECT question_id, COUNT(*) AS n FROM question_chat GROUP BY question_id`)
      .all() as { question_id: number; n: number }[];
    return new Map(rows.map(row => [row.question_id, row.n]));
  }

  private static titleOf(db: Database.Database, sessionId: string): string {
    const row = db.prepare(`SELECT title FROM chat_session WHERE id = ?`).get(sessionId) as
      { title: string } | undefined;
    return row?.title || "未命名对话";
  }

  /** 关联对话；已关联的返回 false（不覆盖原来记下的消息 id） */
  static link(db: Database.Database, questionId: number, target: QuestionChatTarget): boolean {
    const question = QuestionTable.getQuestionById(db, questionId);
    if (!question) throw new Error("问题不存在");
    if (!target.sessionId) throw new Error("对话 id 为空");
    const now = Date.now();
    const messageIds = target.messageIds?.length ? JSON.stringify(target.messageIds) : null;
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO question_chat (question_id, session_id, message_ids, create_time)
         VALUES (?, ?, ?, ?)`
      )
      .run(questionId, target.sessionId, messageIds, now);
    if (result.changes === 0) return false;
    QuestionEventTable.log(
      db,
      questionId,
      "link",
      {
        targetType: "chat-session",
        sessionId: target.sessionId,
        title: this.titleOf(db, target.sessionId),
      },
      now
    );
    if (question.status === "not_started") {
      db.prepare(`UPDATE questions SET status = 'in_progress' WHERE id = ?`).run(questionId);
      QuestionEventTable.log(db, questionId, "status", { to: "in_progress", auto: true }, now);
    }
    db.prepare(`UPDATE questions SET update_time = ? WHERE id = ?`).run(now, questionId);
    return true;
  }

  static unlink(db: Database.Database, questionId: number, sessionId: string): number {
    const result = db
      .prepare(`DELETE FROM question_chat WHERE question_id = ? AND session_id = ?`)
      .run(questionId, sessionId);
    if (result.changes === 0) return 0;
    const now = Date.now();
    QuestionEventTable.log(
      db,
      questionId,
      "unlink",
      { targetType: "chat-session", sessionId, title: this.titleOf(db, sessionId) },
      now
    );
    db.prepare(`UPDATE questions SET update_time = ? WHERE id = ?`).run(now, questionId);
    return 1;
  }

  static deleteByQuestion(db: Database.Database, questionId: number) {
    db.prepare(`DELETE FROM question_chat WHERE question_id = ?`).run(questionId);
  }
}
