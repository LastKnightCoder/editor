export * from "./treeBuilder";
export * from "./scopeCodec";

/**
 * 格式化日期
 */
export function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}
