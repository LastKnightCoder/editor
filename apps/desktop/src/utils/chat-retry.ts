export const DEFAULT_CHAT_MAX_RETRIES = 5;

const CONTEXT_LENGTH_ERROR_PATTERNS = [
  /context[_ ]length/i,
  /maximum context/i,
  /context window/i,
  /context.{0,24}(length|limit|window)/i,
  /too many tokens/i,
  /prompt is too long/i,
  /input is too long/i,
  /request.{0,24}too large/i,
  /上下文.{0,12}(过长|超限|长度|窗口)/,
  /输入.{0,12}(过长|超限|长度)/,
];

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const message = typeof error === "string" ? error.trim() : "";
  return message || "请求失败";
};

export const isContextLengthError = (error: unknown): boolean => {
  const message = getErrorMessage(error);
  return CONTEXT_LENGTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};
