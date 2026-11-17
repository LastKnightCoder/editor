/**
 * 测试与评估脚本专用的非空守卫：值缺失时抛出带提示的错误。
 * 用于在表达式位置收窄 `T | null | undefined`，替代非空断言 `!`。
 */
export function must<T>(value: T | null | undefined, hint?: string): T {
  if (value === null || value === undefined) {
    throw new Error(hint ? `must: ${hint}` : "must: 值不可为空");
  }
  return value;
}
