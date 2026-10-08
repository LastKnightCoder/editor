/**
 * 打开正文定位（页面参数 at 的序列化形式）：顶层块序号，或某个勾选项的 taskId（可在任意嵌套层）。
 * 非法值降级为文首。
 */
export type EntityLocation = { block: number } | { taskId: string };

export function parseEntityLocation(value: string | undefined): EntityLocation | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.taskId === "string" && parsed.taskId) return { taskId: parsed.taskId };
    if (Number.isSafeInteger(parsed.block) && parsed.block >= 0) return { block: parsed.block };
  } catch {
    /* 非法地址降级为文首。 */
  }
  return null;
}

export const serializeEntityLocation = (location: EntityLocation): string =>
  JSON.stringify(location);

interface LocatableNode {
  type?: unknown;
  taskId?: unknown;
  children?: unknown;
}

/** 位置对应的正文节点：顶层块越界或找不到勾选项时退到首块 */
export function resolveLocationNode<T>(children: T[], location: EntityLocation | null): T | null {
  if (!location) return null;
  if ("block" in location) return children[location.block] ?? children[0] ?? null;
  const find = (nodes: unknown[]): unknown => {
    for (const node of nodes) {
      const n = node as LocatableNode;
      if (n?.type === "check-list-item" && n.taskId === location.taskId) return node;
      const hit = Array.isArray(n?.children) ? find(n.children) : null;
      if (hit) return hit;
    }
    return null;
  };
  return (find(children) as T | null) ?? children[0] ?? null;
}
