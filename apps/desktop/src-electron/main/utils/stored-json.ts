const reported = new Set<string>();

// JSON 解析错误的消息可能带一小段原文（如 `Unexpected token 'x', "foo" is not valid JSON`），
// 只保留第一个双引号之前的部分
const parseErrorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('"')[0];

/**
 * 存库字段不是合法 JSON、调用方按空值降级时的留痕：只记表字段与行 ID，不记字段原文。
 * 字段损坏是持续状态而不是一次性的过多事件，所以同一字段的同一行每次运行只报一次。
 */
export function reportStoredJsonFailure(field: string, error: unknown, id?: number | string): void {
  const key = id === undefined ? field : `${field}#${id}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.warn("[stored-json] 存库字段解析失败，已按空值处理", {
    field,
    ...(id !== undefined ? { id } : {}),
    error: parseErrorMessage(error),
  });
}
