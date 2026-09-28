import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { getCurrentSystemMessage } from "@earendil-works/pi-ai";
import { canRetryChatMessage } from "@/services/chatRetry";
import type { PiPromptRetry } from "@/types/pi-session";
import { transcriptOf } from "./pi-session-host-core";
import { piEntriesToDesktopMessages } from "./pi-session-transcript";
import { omitEntries } from "./pi-session-files";

/** 复用原问题续跑，返回 false 表示上次在用户消息写入前已失败，需要正常提交。 */
export async function retryHostSession(
  session: AgentSession,
  retry: PiPromptRetry,
  systemPrompt: string,
  signal: AbortSignal
): Promise<boolean> {
  if (session.isStreaming || session.isCompacting) {
    throw new Error("Agent is already processing");
  }
  const transcript = transcriptOf(session.sessionManager);
  const messages = piEntriesToDesktopMessages(transcript);
  const index = messages.findIndex(message =>
    retry.entryId
      ? message.piEntryIds?.includes(retry.entryId)
      : Boolean(retry.clientId && message.clientId === retry.clientId)
  );
  if (index < 0 && !retry.entryId) return false;
  if (!canRetryChatMessage(messages, index)) {
    throw new Error("这条消息已有回答或后续对话，请重新生成并保留原版本");
  }
  signal.throwIfAborted();
  const userEntryId = messages[index].piEntryIds?.[0];
  if (!userEntryId) throw new Error("原问题已不存在，请刷新对话");
  const emptyAnswerIds = transcript
    .slice(transcript.findIndex(entry => entry.id === userEntryId) + 1)
    .filter(entry => entry.message.role === "assistant")
    .map(entry => entry.id);
  if (emptyAnswerIds.length) omitEntries(session.sessionManager, emptyAnswerIds);
  session.refreshContext();

  // 自定义消息续跑不触发 before_agent_start，仍需沿用本轮系统提示与工具声明。
  const transformContext = session.agent.transformContext;
  session.agent.transformContext = async (context, abortSignal) => {
    const transformed = transformContext ? await transformContext(context, abortSignal) : context;
    if (!systemPrompt) return transformed;
    const current = getCurrentSystemMessage(transformed);
    return [
      {
        role: "system",
        content: systemPrompt,
        ...(current?.toolsAdded ? { toolsAdded: current.toolsAdded } : {}),
        timestamp: current?.timestamp ?? Date.now(),
      },
      ...transformed.filter(message => message.role !== "system"),
    ];
  };
  try {
    await session.sendCustomMessage(
      { customType: "desktop-retry", content: "请重试上一条用户请求。", display: false },
      { triggerTurn: true }
    );
    return true;
  } finally {
    session.agent.transformContext = transformContext;
  }
}
