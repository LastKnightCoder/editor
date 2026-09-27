/**
 * 老对话一次性迁移（M4）：五张旧聊天表的每一行 → 一个 pi 会话文件 + 一行 chat_session 目录。
 *
 * - 一行一会话，分支关系靠 parent_session_id + branch_index 保留（分支语义换 pi 会话树留给 M4-d）。
 * - 思考内容**不迁**（用户裁决）：老数据的 reasoning 没有签名，迁过去 pi 会把它当正文重新喂给模型；
 *   与迁移前 desktopMessagesToPi 不回放 thinking 的行为一致，老对话只是看不到当时的思考过程。
 * - 用户消息同时写展示 entry：老对话的文件卡片、mention、skills 在重开后照原样显示。
 * - 旧表**不删**（留到 M8）：迁移出问题可回退；migration_meta 记账保证只跑一次。
 *   迁移前 VACUUM INTO 备份整库（与 editor-block-retirement 同一做法）。
 *
 * electron-free，可单测。
 */
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { MessageContent, RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import { migrateChatSessionMessages } from "@/services/chatMessageSchema";
import { desktopMessagesToPi } from "./pi-session-bridge";
import { writeSessionFile, type DesktopDisplayData } from "./pi-session-files";
import ChatSessionTable from "./tables/chat-session";

export const CHAT_SESSION_MIGRATION_KEY = "chat-session-pi-jsonl:v1";

/** 五张旧表 → 场景与所属对象列 */
interface LegacySource {
  table: string;
  scope: string;
  /** 所属对象的列（主聊天为 null） */
  domainColumn: string | null;
}

export const LEGACY_CHAT_SOURCES: LegacySource[] = [
  { table: "chat_message", scope: "main-chat", domainColumn: null },
  { table: "pdf_chats", scope: "pdf-chat", domainColumn: "pdf_id" },
  { table: "video_note_chats", scope: "video-note-chat", domainColumn: "video_note_id" },
  { table: "vibe_learning_chats", scope: "vibe-learning-chat", domainColumn: "project_id" },
];

interface LegacyRow {
  id: number;
  create_time: number;
  update_time: number;
  messages: string | null;
  title: string | null;
  archived: number | null;
  parent_chat_id: number | null;
  branch_index: number | null;
  domain_ref: number | null;
  group_id?: number | null;
  order_num?: number | null;
  title_dirty?: number | null;
  source?: string | null;
}

export interface ChatSessionMigrationResult {
  skipped: boolean;
  migrated: number;
  failed: Array<{ table: string; id: number; error: string }>;
  backupPath?: string;
}

const tableExists = (db: Database.Database, table: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));

const columnsOf = (db: Database.Database, table: string) =>
  new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      column => column.name
    )
  );

/** 用户消息 → 发给模型的文本（与 desktopMessagesToPi 同一规则，展示 entry 按它认领） */
const modelTextOf = (message: Message): string =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .filter(block => block.type === "text")
        .map(block => (block as { text: string }).text)
        .join("");

/**
 * 一行旧对话 → pi 会话消息序列（每条用户消息附展示 entry）。
 * 用户消息逐条转换以便与展示内容一一对应；assistant 的 reasoning 块先剥掉（不迁思考）。
 */
export async function legacyMessagesToSession(
  messages: Array<RequestMessage | ResponseMessage>,
  provider: string,
  modelId: string
): Promise<Array<{ message: Message; display?: DesktopDisplayData }>> {
  const out: Array<{ message: Message; display?: DesktopDisplayData }> = [];
  for (const message of messages) {
    if (message.role === Role.System || message.role === Role.Tool) continue;
    if (message.role === Role.Assistant) {
      const response = message as ResponseMessage;
      const stripped: ResponseMessage = {
        ...response,
        reasoning_content: "",
        assistant_blocks: (response.assistant_blocks ?? []).filter(
          block => block.type !== "reasoning"
        ),
      };
      for (const converted of await desktopMessagesToPi(
        [stripped as unknown as RequestMessage],
        provider,
        modelId,
        { allowNetwork: false }
      )) {
        out.push({ message: converted });
      }
      continue;
    }
    const [converted] = await desktopMessagesToPi([message as RequestMessage], provider, modelId, {
      allowNetwork: false,
    });
    if (!converted) continue;
    const content: MessageContent[] =
      typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : (message.content as MessageContent[]);
    out.push({
      message: converted,
      display: {
        modelText: modelTextOf(converted),
        content,
        ...(message.clientId ? { clientId: message.clientId } : {}),
      },
    });
  }
  return out;
}

const readMigrationMark = (db: Database.Database): string | undefined =>
  (
    db.prepare("SELECT value FROM migration_meta WHERE key = ?").get(CHAT_SESSION_MIGRATION_KEY) as
      { value: string } | undefined
  )?.value;

/**
 * 执行迁移。sessionDir 为当前库的会话目录；已迁移（migration_meta 有记录）直接返回 skipped。
 * 单行失败不中断整体：记入 failed 并在日志里列出，那一行的旧数据原样留在旧表里。
 */
export async function migrateLegacyChatsToSessions(options: {
  db: Database.Database;
  databasePath: string;
  sessionDir: string;
  cwd: string;
  /** 迁移写入 assistant 消息时的模型身份（仅作标注，不影响内容） */
  modelRef?: { providerId: string; modelId: string };
}): Promise<ChatSessionMigrationResult> {
  const { db } = options;
  db.exec("CREATE TABLE IF NOT EXISTS migration_meta (key TEXT PRIMARY KEY, value TEXT)");
  ChatSessionTable.upgradeTable(db);
  if (readMigrationMark(db)) return { skipped: true, migrated: 0, failed: [] };

  const sources = LEGACY_CHAT_SOURCES.filter(source => tableExists(db, source.table));
  const total = sources.reduce(
    (sum, source) =>
      sum + (db.prepare(`SELECT COUNT(*) AS n FROM ${source.table}`).get() as { n: number }).n,
    0
  );

  let backupPath: string | undefined;
  if (total > 0 && options.databasePath !== ":memory:") {
    backupPath = `${options.databasePath}.pre-chat-session-migration-v1-${randomUUID()}.bak`;
    db.prepare("VACUUM INTO ?").run(backupPath);
  }

  const provider = options.modelRef?.providerId ?? "legacy";
  const modelId = options.modelRef?.modelId ?? "legacy";
  const failed: ChatSessionMigrationResult["failed"] = [];
  const written: string[] = [];
  let migrated = 0;

  for (const source of sources) {
    const columns = columnsOf(db, source.table);
    const optional = ["group_id", "order_num", "title_dirty", "source"].filter(column =>
      columns.has(column)
    );
    const rows = db
      .prepare(
        `SELECT id, create_time, update_time, messages, title, archived, parent_chat_id, branch_index,
                ${source.domainColumn ?? "NULL"} AS domain_ref
                ${optional.length > 0 ? `, ${optional.join(", ")}` : ""}
         FROM ${source.table}
         ORDER BY id`
      )
      .all() as LegacyRow[];

    // 父行先迁（按 id 升序即可：分支总比父对话后建），父 id → 新会话 id
    const idMap = new Map<number, string>();
    for (const row of rows) {
      // 浏览器扩展的对话不进桌面目录表（用户裁决：扩展对话与应用对话拆开、跟着页面走，
      // 旧数据不迁）。行原样留在旧表，M8 随旧表一起删
      if (row.source === "browser") continue;
      try {
        const parsed = migrateChatSessionMessages(JSON.parse(row.messages || "[]"));
        const session = await legacyMessagesToSession(
          parsed.messages as Array<RequestMessage | ResponseMessage>,
          provider,
          modelId
        );
        const sessionId = randomUUID();
        const sessionFile = writeSessionFile({
          sessionDir: options.sessionDir,
          sessionId,
          cwd: options.cwd,
          createdAt: row.create_time,
          messages: session,
        });
        written.push(sessionFile);
        const parentSessionId =
          row.parent_chat_id !== null ? (idMap.get(row.parent_chat_id) ?? null) : null;
        ChatSessionTable.create(db, {
          id: sessionId,
          scope: source.scope,
          domainRef: row.domain_ref !== null ? String(row.domain_ref) : null,
          sessionFile,
          cwd: options.cwd,
          title: row.title ?? "",
          titleDirty: row.title_dirty === undefined ? true : Boolean(row.title_dirty),
          groupId: row.group_id ?? null,
          orderNum: row.order_num ?? null,
          archived: Boolean(row.archived),
          source: row.source === "browser" ? "browser" : "desktop",
          messageCount: session.filter(item => item.message.role === "user").length,
          parentSessionId,
          branchIndex: parentSessionId ? (row.branch_index ?? 0) : 0,
          createTime: row.create_time,
          updateTime: row.update_time,
        });
        idMap.set(row.id, sessionId);
        migrated += 1;
      } catch (error) {
        failed.push({
          table: source.table,
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  db.prepare("INSERT OR REPLACE INTO migration_meta (key, value) VALUES (?, ?)").run(
    CHAT_SESSION_MIGRATION_KEY,
    JSON.stringify({ migrated, failed: failed.length, at: Date.now() })
  );
  return { skipped: false, migrated, failed, ...(backupPath ? { backupPath } : {}) };
}

/** 测试辅助：清掉迁移写出的会话文件 */
export function clearSessionDir(sessionDir: string): void {
  if (!existsSync(sessionDir)) return;
  for (const name of readdirSync(sessionDir)) rmSync(join(sessionDir, name), { force: true });
}
