/** 候选文档模型的准入预算；各根共享节点额度，包含仍可恢复的记录。 */
export const NODE_TREE_LIMITS = Object.freeze({
  roots: 1024,
  rootIdLength: 128,
  nodes: 150_000,
  depth: 64,
});

/** 白板首期的存储准入预算，不代表已测得的渲染或网络容量。 */
export const WHITEBOARD_LIMITS = Object.freeze({
  documentBytes: 8 * 1024 * 1024,
  pages: 64,
  elements: 5000,
  richTextRoots: NODE_TREE_LIMITS.roots,
  richTextNodes: NODE_TREE_LIMITS.nodes,
  commandsPerBatch: 256,
  batchBytes: 512 * 1024,
  payloadDepth: 64,
  patchBytes: 64 * 1024,
  presenceBytes: 16_384,
  presencePerMinute: 600,
});

export function assertWhiteboardBudget(
  usage: Partial<Record<keyof typeof WHITEBOARD_LIMITS, number>>
): void {
  if (
    !usage ||
    typeof usage !== "object" ||
    Array.isArray(usage) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(usage)) ||
    Reflect.ownKeys(usage).some(key => typeof key !== "string")
  )
    throw new Error("白板用量必须是普通对象");
  for (const [key, value] of Object.entries(usage)) {
    if (
      !Object.hasOwn(WHITEBOARD_LIMITS, key) ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > WHITEBOARD_LIMITS[key as keyof typeof WHITEBOARD_LIMITS]
    )
      throw new Error("白板用量无效或超过预算");
  }
}
