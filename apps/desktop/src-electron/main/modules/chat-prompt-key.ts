export const CHAT_PROMPT_TYPE = "chat-prompt";

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
