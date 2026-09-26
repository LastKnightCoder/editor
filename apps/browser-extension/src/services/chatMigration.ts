/**
 * chrome.storage 旧会话一次性迁移到桌面 sqlite（D-059 阶段 3）。
 * 按 URL 分组逐组导入（组粒度断点续传）；成功仅在迁移状态里打标，
 * 不清除 chrome.storage 原始数据（保留回滚窗口，稳定后再清理）。
 */
import type { ChatMessageType, MessageContentItem } from "@tau/shared";
import { createChat, ensureGroupForUrl } from "./chatStoreClient";
import { toStoredMessages, withSystemPrompt } from "./chatModelBridge";

const STORAGE_PREFIX_META = "tau-chats-meta:";
const STORAGE_PREFIX_MESSAGES = "tau-chat-messages:";
const MIGRATION_STATE_KEY = "tau-chat-store-migration";

interface LegacyChatSession {
  id: string;
  title: string;
  createTime: number;
  updateTime: number;
  parentChatId?: string;
  branchIndex?: number;
  systemPromptSnapshot?: string;
}

interface MigrationState {
  urls: Record<string, boolean>;
  /** legacy 会话 id → 桌面 chat id（组内断点续传 + 分支 parentChatId 映射） */
  sessionIdMap?: Record<string, number>;
  completedAt?: number;
}

const extractTextContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        (item as { type?: string }).type === "text" &&
        "text" in item &&
        typeof (item as { text?: unknown }).text === "string"
    )
    .map(item => item.text)
    .join("\n");
};

const normalizeStoredMessages = (messages: unknown[]): ChatMessageType[] => {
  const now = Date.now();
  return messages
    .map((message, index): ChatMessageType | null => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const source = message as Record<string, unknown>;
      const role =
        source.role === "user" ||
        source.role === "assistant" ||
        source.role === "system" ||
        source.role === "tool"
          ? source.role
          : "assistant";

      const normalized: ChatMessageType = {
        id: typeof source.id === "string" && source.id ? source.id : `migrated-${now}-${index}`,
        role,
        content: extractTextContent(source.content),
        timestamp: typeof source.timestamp === "number" ? source.timestamp : now + index * 10,
      };

      if (typeof source.reasoning === "string") {
        normalized.reasoning = source.reasoning;
      }
      if (Array.isArray(source.contentBlocks)) {
        normalized.contentBlocks = source.contentBlocks as ChatMessageType["contentBlocks"];
      }
      if (typeof source.name === "string" && source.name.length > 0) {
        (normalized as ChatMessageType & { name?: string }).name = source.name;
      }
      if (typeof source.tool_call_id === "string" && source.tool_call_id.length > 0) {
        (normalized as ChatMessageType & { tool_call_id?: string }).tool_call_id =
          source.tool_call_id;
      }
      if (Array.isArray(source.tool_calls)) {
        (normalized as ChatMessageType & { tool_calls?: unknown[] }).tool_calls = source.tool_calls;
      }
      if (Array.isArray(source.requestContent)) {
        const requestContent = source.requestContent.filter(
          (item): item is MessageContentItem =>
            Boolean(item) && typeof item === "object" && "type" in item
        );
        if (requestContent.length > 0) {
          (
            normalized as ChatMessageType & { requestContent?: MessageContentItem[] }
          ).requestContent = requestContent;
        }
      }

      return normalized;
    })
    .filter((message): message is ChatMessageType => Boolean(message));
};

const readLegacySessionMessages = async (sessionId: string): Promise<ChatMessageType[]> => {
  const key = `${STORAGE_PREFIX_MESSAGES}${sessionId}`;
  const result = await chrome.storage.local.get(key);
  const raw = result[key];
  if (Array.isArray(raw)) {
    return normalizeStoredMessages(raw);
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { messages?: unknown[] }).messages)) {
    return normalizeStoredMessages((raw as { messages: unknown[] }).messages);
  }
  return [];
};

const readMigrationState = async (): Promise<MigrationState> => {
  const result = await chrome.storage.local.get(MIGRATION_STATE_KEY);
  return (result[MIGRATION_STATE_KEY] as MigrationState | undefined) ?? { urls: {} };
};

const writeMigrationState = async (state: MigrationState) => {
  await chrome.storage.local.set({ [MIGRATION_STATE_KEY]: state });
};

/** 父会话先于子分支排序（保证导入时 parentChatId 映射已建立）；环状数据不崩溃，按可达深度排序 */
const sortParentsFirst = (sessions: LegacyChatSession[]): LegacyChatSession[] => {
  const byId = new Map(sessions.map(session => [session.id, session]));
  const depthOf = (session: LegacyChatSession): number => {
    let depth = 0;
    let current: LegacyChatSession | undefined = session;
    const visited = new Set<string>([session.id]);
    while (
      current?.parentChatId &&
      byId.has(current.parentChatId) &&
      !visited.has(current.parentChatId)
    ) {
      visited.add(current.parentChatId);
      current = byId.get(current.parentChatId);
      depth += 1;
    }
    return depth;
  };
  return [...sessions].sort((a, b) => depthOf(a) - depthOf(b));
};

const normalizeLegacySession = (raw: unknown, index: number): LegacyChatSession | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) {
    return null;
  }
  return {
    id: source.id,
    title: typeof source.title === "string" && source.title ? source.title : `对话 ${index + 1}`,
    createTime: typeof source.createTime === "number" ? source.createTime : Date.now(),
    updateTime: typeof source.updateTime === "number" ? source.updateTime : Date.now(),
    ...(typeof source.parentChatId === "string" ? { parentChatId: source.parentChatId } : {}),
    ...(typeof source.branchIndex === "number" ? { branchIndex: source.branchIndex } : {}),
    ...(typeof source.systemPromptSnapshot === "string"
      ? { systemPromptSnapshot: source.systemPromptSnapshot }
      : {}),
  };
};

/** 执行迁移（幂等，可断点续传）。桌面离线时静默跳过，待下次运行。 */
export const runChatMigration = async (): Promise<void> => {
  try {
    const state = await readMigrationState();
    if (state.completedAt) {
      return;
    }

    const storage = await chrome.storage.local.get(null);
    const metaKeys = Object.keys(storage).filter(key => key.startsWith(STORAGE_PREFIX_META));
    if (metaKeys.length === 0) {
      await writeMigrationState({ ...state, completedAt: Date.now() });
      return;
    }

    for (const metaKey of metaKeys) {
      const url = metaKey.slice(STORAGE_PREFIX_META.length);
      if (state.urls[url]) {
        continue;
      }

      const rawSessions = storage[metaKey];
      if (!Array.isArray(rawSessions) || rawSessions.length === 0) {
        state.urls[url] = true;
        await writeMigrationState(state);
        continue;
      }

      const groupId = await ensureGroupForUrl(url);
      if (groupId === null) {
        // 桌面离线：本轮中止，保留进度
        return;
      }

      const sessions = sortParentsFirst(
        rawSessions
          .map((raw, index) => normalizeLegacySession(raw, index))
          .filter((session): session is LegacyChatSession => Boolean(session))
      );

      // 恢复上次中断处的 legacy id → 桌面 id 映射（分支 parentChatId 依赖它）
      const idMap = new Map<string, number>(Object.entries(state.sessionIdMap ?? {}));
      for (const session of sessions) {
        // 组内断点：已导入的会话跳过，失败重跑不产生重复行
        if (idMap.has(session.id)) {
          continue;
        }

        const legacyMessages = await readLegacySessionMessages(session.id);
        const parentChatId = session.parentChatId
          ? (idMap.get(session.parentChatId) ?? null)
          : null;
        const created = await createChat({
          messages: withSystemPrompt(
            toStoredMessages(legacyMessages),
            session.systemPromptSnapshot
          ),
          title: session.title,
          groupId,
          parentChatId,
          branchIndex: session.branchIndex,
        });
        idMap.set(session.id, created.id);
        state.sessionIdMap = Object.fromEntries(idMap);
        await writeMigrationState(state);
      }

      state.urls[url] = true;
      delete state.sessionIdMap;
      await writeMigrationState(state);
      // 通知 UI 刷新（导入期间会话列表可能读到部分数据）
      window.dispatchEvent(new Event("tau-chat-store-changed"));
    }

    await writeMigrationState({ ...state, completedAt: Date.now() });
    window.dispatchEvent(new Event("tau-chat-store-changed"));
    console.log("[chatMigration] 旧会话迁移完成");
  } catch (error) {
    console.warn("[chatMigration] 迁移未完成，将在下次运行时重试:", error);
  }
};

export const __chatMigrationTestUtils = {
  sortParentsFirst,
  normalizeLegacySession,
  normalizeStoredMessages,
  STORAGE_PREFIX_META,
  STORAGE_PREFIX_MESSAGES,
  MIGRATION_STATE_KEY,
};
