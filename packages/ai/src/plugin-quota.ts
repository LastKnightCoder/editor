interface Message {
  role: string;
  content: string;
  images?: readonly unknown[];
}

/** 预占只用于本次请求，完成后由宿主按可确认的实际用量结算。 */
export function reservePluginInputTokens(
  messages: readonly Message[],
  contextWindow: number
): number {
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0)
    throw new Error("AI_INVALID_REQUEST：模型上下文容量无效");
  if (messages.some(message => message.role === "user" && message.images?.length))
    return contextWindow;
  // 文本按 UTF-8 字节保守估算，并为消息封装预留空间。
  const encoder = new TextEncoder();
  const tokens = messages.reduce(
    (total, message) => total + encoder.encode(message.content).length + 64,
    256
  );
  return Math.min(tokens, contextWindow);
}
