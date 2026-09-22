import { EntityScope } from "../types";

/**
 * 编码作用域为字符串（用于存储）
 */
export function encodeScope(scope: EntityScope): string {
  if (scope.mode === "partial") {
    return JSON.stringify({
      mode: "partial",
      nodes: Array.from(scope.nodeIds),
    });
  }
  return "";
}

/**
 * 解码字符串为作用域
 */
export function decodeScope(raw: string): EntityScope {
  if (!raw) {
    return { mode: "all" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.mode === "partial" && Array.isArray(parsed.nodes)) {
      const nodeIds = new Set(
        parsed.nodes.filter((value: unknown) => typeof value === "number") as number[]
      );
      if (nodeIds.size > 0) {
        return { mode: "partial", nodeIds };
      }
    }
  } catch {
    return { mode: "all" };
  }
  return { mode: "all" };
}
