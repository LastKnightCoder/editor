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
 * 解码字符串为作用域。
 * 空串表示从未设置过范围（全量）；存在记录但无法解析出合法结构时按空范围处理并打上
 * corrupted 标记，由界面提示重新选择，绝不静默升级为全量发布。
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
      return { mode: "partial", nodeIds };
    }
  } catch {
    return { mode: "partial", nodeIds: new Set(), corrupted: true };
  }
  return { mode: "partial", nodeIds: new Set(), corrupted: true };
}
