/**
 * 对话信号入索引（KL-064，02 §5.5）：主对话里用户自己的提问写进索引库向量（type = chat-prompt），
 * 只服务「问了但没写」。AI 回答、工具结果、PDF / 视频 / Notebook 对话、浏览器插件对话都不入（KL-006）。
 *
 * 作为主库向量队列的一个候选来源：prefixed_id = chat-prompt:<会话 id>#<消息 id>，update_time = 消息时间
 * （提问发出后不会再变）。不进全文索引、不进检索结果、不进覆盖率统计。
 * 会话文件按 chat_session.update_time 缓存解析结果，没变的会话不再读文件。
 */

import type Database from "better-sqlite3";
import { existsSync } from "node:fs";
import log from "electron-log";
import type { ContentSection } from "@/entity/sections";
import { loadSessionTranscript } from "./pi-session-host-core";
import { chatSessionDirOfDb, resolveSessionFile } from "./pi-session-paths";
import type { PiTranscriptEntry } from "./pi-session-transcript";

export const CHAT_PROMPT_TYPE = "chat-prompt";
/** 太短的（「继续」「好的」）不是方向信号 */
export const MIN_PROMPT_CHARS = 6;
const MAX_PROMPT_CHARS = 1000;

export interface ChatPromptDoc {
  /** 会话 id#消息 id */
  id: string;
  type: typeof CHAT_PROMPT_TYPE;
  content: string;
  sections: ContentSection[];
  updateTime: number;
}

interface SessionRow {
  id: string;
  session_file: string;
  update_time: number;
}

const cache = new Map<string, { updateTime: number; docs: ChatPromptDoc[] }>();

export const chatPromptId = (sessionId: string, messageId: string) => `${sessionId}#${messageId}`;

/** chat-prompt 向量的 prefixed_id 拆回会话与消息 */
export function parseChatPromptKey(
  prefixedId: string
): { sessionId: string; messageId: string } | null {
  if (!prefixedId.startsWith(`${CHAT_PROMPT_TYPE}:`)) return null;
  const rest = prefixedId.slice(CHAT_PROMPT_TYPE.length + 1);
  const hash = rest.lastIndexOf("#");
  if (hash <= 0) return null;
  return { sessionId: rest.slice(0, hash), messageId: rest.slice(hash + 1) };
}

/** 用户消息的模型文本（不含文件卡片等展示结构） */
function userText(entry: PiTranscriptEntry): string {
  const content = entry.message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(block =>
      block && typeof block === "object" && (block as { type?: unknown }).type === "text"
        ? String((block as { text?: unknown }).text ?? "")
        : ""
    )
    .join("\n");
}

/** 一个会话里可以入索引的提问（纯函数，测试直接喂转录） */
export function promptsOfTranscript(
  sessionId: string,
  entries: PiTranscriptEntry[],
  fallbackTime: number
): ChatPromptDoc[] {
  const docs: ChatPromptDoc[] = [];
  for (const entry of entries) {
    if (entry.message.role !== "user") continue;
    const text = userText(entry).replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS);
    if (text.length < MIN_PROMPT_CHARS) continue;
    docs.push({
      id: chatPromptId(sessionId, entry.id),
      type: CHAT_PROMPT_TYPE,
      content: text,
      sections: [
        {
          chunkIndex: 0,
          headingPath: "",
          text,
          blockStart: 0,
          blockEnd: 0,
          charCount: text.length,
          embeddingText: text,
        },
      ],
      updateTime: Number(entry.message.timestamp) || fallbackTime,
    });
  }
  return docs;
}

/** 会话文件还没落盘（刚建的会话）时当作没有消息 */
const readTranscript = (file: string, dir: string): PiTranscriptEntry[] =>
  existsSync(file) ? loadSessionTranscript(file, dir) : [];

/** 当前库全部主对话的提问；单个会话读失败只跳过它 */
export function listChatPromptDocs(
  mainDb: Database.Database,
  read: (file: string, dir: string) => PiTranscriptEntry[] = readTranscript
): ChatPromptDoc[] {
  const dir = chatSessionDirOfDb(mainDb);
  if (!dir) return [];
  const hasTable = mainDb
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chat_session'`)
    .get();
  if (!hasTable) return [];
  const sessions = mainDb
    .prepare(
      `SELECT id, session_file, update_time FROM chat_session WHERE scope = 'main-chat' ORDER BY id`
    )
    .all() as SessionRow[];
  const docs: ChatPromptDoc[] = [];
  const alive = new Set<string>();
  for (const session of sessions) {
    const key = `${dir}\u0000${session.id}`;
    alive.add(key);
    const cached = cache.get(key);
    if (cached && cached.updateTime === session.update_time) {
      docs.push(...cached.docs);
      continue;
    }
    let found: ChatPromptDoc[] = [];
    try {
      const file = resolveSessionFile(dir, session.session_file);
      found = promptsOfTranscript(session.id, read(file, dir), session.update_time);
    } catch (error) {
      log.warn(`[ChatPromptIndex] 读取会话失败 ${session.id}`, error);
    }
    cache.set(key, { updateTime: session.update_time, docs: found });
    docs.push(...found);
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${dir}\u0000`) && !alive.has(key)) cache.delete(key);
  }
  return docs;
}

/** 测试用：清掉解析缓存 */
export function resetChatPromptCache() {
  cache.clear();
}
