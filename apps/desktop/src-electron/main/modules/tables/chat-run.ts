import Database from "better-sqlite3";
import type { ChatSessionMessage } from "@/types/llm";

// chat_run 表的行形状（渲染端链路已随 pi 会话驱动退役；本表与 handler 留存至 M8 删除）
export type ChatRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ChatRunRecord {
  runId: string;
  sessionKey: string;
  source: string;
  chatId: number;
  status: ChatRunStatus;
  requestPayload: ChatSessionMessage[];
  userMessageClientId: string;
  assistantMessageClientId: string;
  attempt: number;
  assistantSnapshot: string;
  reasoningSnapshot: string;
  toolSnapshot: unknown[];
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

type ChatRunRow = Record<string, any>;
const parse = (row: ChatRunRow): ChatRunRecord => ({
  runId: row.run_id,
  sessionKey: row.session_key,
  source: row.source,
  chatId: Number(row.chat_id),
  status: row.agent_type === "codex" && row.status === "waiting_input" ? "interrupted" : row.status,
  requestPayload: JSON.parse(row.request_payload || "[]"),
  userMessageClientId: row.user_message_client_id,
  assistantMessageClientId: row.assistant_message_client_id,
  attempt: row.attempt,
  assistantSnapshot: row.assistant_snapshot || "",
  reasoningSnapshot: row.reasoning_snapshot || "",
  toolSnapshot: JSON.parse(row.tool_snapshot || "[]"),
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export default class ChatRunTable {
  static upgradeTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_run (
        run_id TEXT PRIMARY KEY, session_key TEXT NOT NULL, source TEXT NOT NULL,
        chat_id INTEGER NOT NULL, agent_type TEXT NOT NULL DEFAULT 'local',
        status TEXT NOT NULL, request_payload TEXT NOT NULL,
        user_message_client_id TEXT NOT NULL, assistant_message_client_id TEXT NOT NULL,
        agent_session_id TEXT, attempt INTEGER NOT NULL DEFAULT 0,
        assistant_snapshot TEXT NOT NULL DEFAULT '', reasoning_snapshot TEXT NOT NULL DEFAULT '',
        tool_snapshot TEXT NOT NULL DEFAULT '[]', error_message TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_run_session_status ON chat_run(session_key, status);
      CREATE INDEX IF NOT EXISTS idx_chat_run_updated_at ON chat_run(updated_at);
    `);
    this.compactReconciledTerminalRuns(db);
  }

  static compactReconciledTerminalRuns(db: Database.Database) {
    const hasChatMessageTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chat_message'")
      .get();
    if (!hasChatMessageTable) return 0;

    return db
      .prepare(
        `UPDATE chat_run AS run
         SET request_payload='[]',assistant_snapshot='',reasoning_snapshot='',tool_snapshot='[]'
         WHERE run.status IN ('completed','cancelled')
           AND (run.request_payload<>'[]' OR run.assistant_snapshot<>''
             OR run.reasoning_snapshot<>'' OR run.tool_snapshot<>'[]')
           AND EXISTS (
             SELECT 1 FROM chat_message AS chat
             WHERE chat.id=run.chat_id AND json_valid(chat.messages)
           )
           AND (
             (run.assistant_message_client_id<>'' AND EXISTS (
               SELECT 1 FROM chat_message AS chat,
                 json_each(CASE WHEN json_valid(chat.messages) THEN chat.messages ELSE '[]' END) AS message
               WHERE chat.id=run.chat_id
                 AND json_extract(message.value,'$.role')='assistant'
                 AND json_extract(message.value,'$.clientId')=run.assistant_message_client_id
             ))
             OR
             (run.assistant_message_client_id='' AND EXISTS (
               SELECT 1 FROM chat_message AS chat,
                 json_each(CASE WHEN json_valid(chat.messages) THEN chat.messages ELSE '[]' END) AS message
               WHERE chat.id=run.chat_id
                 AND json_extract(message.value,'$.clientId')=run.user_message_client_id
             ) AND (
               (run.status='cancelled' AND run.assistant_snapshot='')
               OR EXISTS (
                 SELECT 1 FROM chat_message AS chat,
                   json_each(CASE WHEN json_valid(chat.messages) THEN chat.messages ELSE '[]' END) AS message
                 WHERE chat.id=run.chat_id
                   AND json_extract(message.value,'$.role')='assistant'
                   AND json_extract(message.value,'$.content')=run.assistant_snapshot
               )
             ))
           )`
      )
      .run().changes;
  }

  static getListenEvents() {
    return {
      "chat-run:create": this.create.bind(this),
      "chat-run:update": this.update.bind(this),
      "chat-run:get": this.get.bind(this),
      "chat-run:get-active": this.getActive.bind(this),
      "chat-run:finalize": this.finalize.bind(this),
      "chat-run:delete": this.delete.bind(this),
      "chat-run:delete-session": this.deleteForSession.bind(this),
    };
  }

  static create(db: Database.Database, record: Omit<ChatRunRecord, "createdAt" | "updatedAt">) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO chat_run
      (run_id,session_key,source,chat_id,status,request_payload,user_message_client_id,
       assistant_message_client_id,attempt,assistant_snapshot,reasoning_snapshot,
       tool_snapshot,error_message,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      record.runId,
      record.sessionKey,
      record.source,
      record.chatId,
      record.status,
      JSON.stringify(record.requestPayload),
      record.userMessageClientId,
      record.assistantMessageClientId,
      record.attempt,
      record.assistantSnapshot,
      record.reasoningSnapshot,
      JSON.stringify(record.toolSnapshot),
      record.errorMessage,
      now,
      now
    );
    return this.get(db, record.runId);
  }

  static update(db: Database.Database, record: ChatRunRecord) {
    db.prepare(
      `UPDATE chat_run SET status=?,request_payload=?,attempt=?,
      assistant_snapshot=?,reasoning_snapshot=?,tool_snapshot=?,error_message=?,updated_at=? WHERE run_id=?`
    ).run(
      record.status,
      JSON.stringify(record.requestPayload),
      record.attempt,
      record.assistantSnapshot,
      record.reasoningSnapshot,
      JSON.stringify(record.toolSnapshot),
      record.errorMessage,
      Date.now(),
      record.runId
    );
    return this.get(db, record.runId);
  }

  static get(db: Database.Database, runId: string) {
    const row = db.prepare("SELECT * FROM chat_run WHERE run_id=?").get(runId) as
      ChatRunRow | undefined;
    return row ? parse(row) : null;
  }

  static getActive(db: Database.Database) {
    const rows = db
      .prepare(
        "SELECT * FROM chat_run WHERE status IN ('queued','running','retrying','waiting_input','interrupted') ORDER BY updated_at ASC"
      )
      .all() as ChatRunRow[];
    return rows.map(parse);
  }

  static finalize(
    db: Database.Database,
    runId: string,
    status: Extract<ChatRunStatus, "completed" | "cancelled">,
    errorMessage?: string | null
  ) {
    db.prepare(
      `UPDATE chat_run SET status=?,request_payload='[]',assistant_snapshot='',
       reasoning_snapshot='',tool_snapshot='[]',error_message=?,updated_at=? WHERE run_id=?`
    ).run(status, errorMessage ?? null, Date.now(), runId);
    return this.get(db, runId);
  }

  static delete(db: Database.Database, runId: string) {
    return db.prepare("DELETE FROM chat_run WHERE run_id=?").run(runId).changes;
  }

  static deleteForSession(db: Database.Database, sessionKey: string) {
    return db.prepare("DELETE FROM chat_run WHERE session_key=?").run(sessionKey).changes;
  }
}
