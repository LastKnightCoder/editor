/**
 * 正文审阅里需要 Agent 接着做的事（过期建议「让它按新原文重写」）：
 * 先在主进程把该条退回并附意见；发起它的工具调用还在等待时，意见随逐条结果交给 Agent；
 * 工具已经结束（对话停了、重载过）就在主窗口往原对话追加一句。独立窗口经主进程转发给主窗口。
 */

import { toast } from "@tau/ui";
import { bindDatabaseCommands } from "@/services/command-context";
import { rejectContentSuggestions } from "@/commands/content";
import { invoke, isElectron, on } from "@/electron";
import { sendToChat } from "@/features/chat/chatSend";
import { isMainWindow } from "@/utils/window-role";
import { MAIN_AGENT_NAME } from "@/services/agent-identity";
import { CONTENT_SUGGESTION_FOLLOW_UP, type ContentSuggestion } from "@/types/content-suggestion";
import { hasLiveSuggestionReview } from "./review-session";

export const REWRITE_FEEDBACK = "原文已变化，请按当前原文重写这一条";

export interface SuggestionFollowUp {
  databaseName: string;
  proposalId: string;
  conversationKey: string;
  contentId: number;
  agentLabel?: string;
  text: string;
  kind?: "continue";
}

/** 会话键 `<库>\0main-chat:<对话>[:subagent:<子 Agent>]` → 主聊天对话 ID；其他作用域的对话不在停靠栏里 */
const mainChatOf = (conversationKey: string) => {
  const scoped = conversationKey.split("\u0000")[1] ?? "";
  if (!scoped.startsWith("main-chat:")) return undefined;
  return scoped.slice("main-chat:".length).split(":subagent:")[0] || undefined;
};

const clip = (text: string) => {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 60 ? `${value.slice(0, 59)}…` : value;
};

async function deliver(request: SuggestionFollowUp) {
  if (request.kind !== "continue" && hasLiveSuggestionReview(request.proposalId)) return true;
  const chatId = mainChatOf(request.conversationKey);
  if (!chatId) return false;
  const subagent = request.conversationKey.includes(":subagent:");
  const who =
    request.agentLabel && request.agentLabel !== MAIN_AGENT_NAME ? request.agentLabel : "";
  const text = subagent
    ? `请让「${who || "子 Agent"}」${request.text}（正文 contentId=${request.contentId}）`
    : `${request.text}（正文 contentId=${request.contentId}）`;
  return sendToChat({
    databaseName: request.databaseName,
    chatId,
    content: [{ type: "text", text }],
  });
}

/** 主窗口接收其他窗口转发来的跟进请求；应用启动时调用一次 */
export function initSuggestionFollowUps() {
  if (!isElectron || !isMainWindow()) return;
  on(CONTENT_SUGGESTION_FOLLOW_UP, (_event, request: SuggestionFollowUp) => {
    void deliver(request)
      .then(sent => {
        if (!sent) toast.warning("重写请求未送达，请到原对话继续");
      })
      .catch(() => toast.warning("重写请求未送达，请到原对话继续"));
  });
}

/** 过期建议交给 Agent 按当前原文重写；返回 false 表示没能送到（原对话不在主聊天里） */
export async function requestSuggestionRewrite(
  databaseName: string,
  suggestion: ContentSuggestion
) {
  const rejected = await bindDatabaseCommands(
    { rejectContentSuggestions },
    { databaseName }
  ).rejectContentSuggestions(suggestion.contentId, [suggestion.id], REWRITE_FEEDBACK);
  if (!rejected.includes(suggestion.id)) return true;
  const request: SuggestionFollowUp = {
    databaseName,
    proposalId: suggestion.proposalId,
    conversationKey: suggestion.conversationKey,
    contentId: suggestion.contentId,
    ...(suggestion.agentLabel ? { agentLabel: suggestion.agentLabel } : {}),
    text: `按当前原文重写这条建议：「${clip(suggestion.beforeText)}」→「${clip(suggestion.afterText)}」，原文已被改动`,
  };
  if (isMainWindow()) return deliver(request);
  return bindDatabaseCommands({ invoke }, { databaseName }).invoke<boolean>(
    "content:suggestions-follow-up",
    request
  );
}

/** 已处理改动的续改是原对话的新消息，不改变上一条的接受或撤销记录。 */
export async function requestSuggestionContinuation(
  databaseName: string,
  suggestion: ContentSuggestion,
  instruction: string
) {
  const text = instruction.trim();
  if (!text || (suggestion.status !== "accepted" && suggestion.status !== "undone")) return false;
  const blockId =
    suggestion.edit.kind === "text"
      ? suggestion.edit.blockId
      : (suggestion.edit.expected[0]?.collabId ?? suggestion.edit.left ?? suggestion.edit.right);
  const request: SuggestionFollowUp = {
    databaseName,
    proposalId: suggestion.proposalId,
    conversationKey: suggestion.conversationKey,
    contentId: suggestion.contentId,
    agentLabel: suggestion.agentLabel,
    kind: "continue",
    text: `继续处理修改 ${suggestion.id}「${clip(suggestion.beforeText)}」→「${clip(suggestion.afterText)}」。先重读当前正文${blockId ? `的目标块 ${blockId}` : ""}，保留后续人工编辑。新要求：${text}`,
  };
  if (isMainWindow()) return deliver(request);
  return bindDatabaseCommands({ invoke }, { databaseName }).invoke<boolean>(
    "content:suggestions-follow-up",
    request
  );
}
