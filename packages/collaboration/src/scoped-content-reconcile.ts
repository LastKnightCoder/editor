import type { ContentNode } from "./protocol";
import type { NodeTree } from "./node-tree";
import { replaceText, sharedValueEquals } from "./shared-values";

const leaf = (node: ContentNode) =>
  typeof node.text === "string" && !Object.hasOwn(node, "children");
function indexNodes(nodes: readonly ContentNode[]) {
  const result = new Map<string, { node: ContentNode; parent: string | null }>();
  const visit = (items: readonly ContentNode[], parent: string | null, depth: number): boolean => {
    if (depth > 64) return false;
    for (const node of items) {
      if (!node || typeof node !== "object" || Array.isArray(node)) return false;
      if (leaf(node)) {
        if (parent === null) return false;
        continue;
      }
      if (
        typeof node.collabId !== "string" ||
        !Array.isArray(node.children) ||
        result.has(node.collabId)
      )
        return false;
      result.set(node.collabId, { node, parent });
      if (!visit(node.children, node.collabId, depth + 1)) return false;
    }
    return true;
  };
  return visit(nodes, null, 0) ? result : null;
}

/** 只复用相同父级、类型和契约的可见身份；混合行内结构不重排其文本位置。 */
export function canReconcileScopedBlocks(
  before: readonly ContentNode[],
  after: readonly ContentNode[]
): boolean {
  const old = indexNodes(before),
    next = indexNodes(after);
  if (!old || !next || old.size !== next.size) return false;
  for (const [id, entry] of old) {
    const candidate = next.get(id);
    if (
      !candidate ||
      entry.parent !== candidate.parent ||
      entry.node.type !== candidate.node.type ||
      entry.node.tauContract !== candidate.node.tauContract
    )
      return false;
    const a = entry.node.children ?? [],
      b = candidate.node.children ?? [];
    const mixed = a.some(leaf) && a.some(node => !leaf(node));
    const nextMixed = b.some(leaf) && b.some(node => !leaf(node));
    if (mixed || nextMixed) {
      const shape = (nodes: ContentNode[]) =>
        nodes.map(node => (leaf(node) ? node : { collabId: node.collabId }));
      if (!sharedValueEquals(shape(a), shape(b))) return false;
    }
  }
  return true;
}

export function reconcileScopedBlocks(
  tree: NodeTree,
  before: readonly ContentNode[],
  after: readonly ContentNode[],
  start: number,
  origin: unknown
): void {
  if (!canReconcileScopedBlocks(before, after)) throw new Error("原生块身份或结构不匹配");
  const previous = indexNodes(before);
  if (!previous) throw new Error("原生块身份无效");
  const update = (node: ContentNode) => {
    const id = String(node.collabId);
    const old = previous.get(id)?.node;
    if (!old) throw new Error("原生块身份不存在");
    const fields = tree.contract(id)?.textFields ?? [];
    const patch: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(old), ...Object.keys(node)])) {
      if (["children", "collabId", ...fields].includes(key)) continue;
      if (!sharedValueEquals(old[key], node[key])) patch[key] = node[key];
    }
    if (Object.keys(patch).length) tree.setProperties(id, patch, origin);
    for (const key of fields) {
      if (typeof node[key] !== "string") throw new Error("源码字段必须是字符串");
      if (old[key] !== node[key]) replaceText(tree.textField(id, key), node[key]);
    }
    const children = node.children ?? [];
    if (children.every(leaf)) {
      if (!sharedValueEquals(old.children, children)) {
        const length = tree.spans(id).reduce((sum, span) => sum + span.length, 0);
        if (length) tree.deleteText(id, 0, length, origin);
        let offset = 0;
        for (const child of children) {
          const { text, ...marks } = child;
          if (typeof text !== "string") throw new Error("文本节点无效");
          if (text) tree.insertText(id, offset, text, origin, marks);
          offset += text.length;
        }
        if (!offset) {
          const marks = { ...children[0] };
          delete marks.text;
          tree.record(id).set("emptyMarks", marks);
        }
      }
    } else if (children.every(child => !leaf(child))) {
      children.forEach((child, index) => {
        const current = tree.nodeSnapshot(id).children?.[index];
        if (current?.collabId !== child.collabId)
          tree.moveNode(String(child.collabId), id, index, origin);
        update(child);
      });
    } else {
      for (const child of children) if (!leaf(child)) update(child);
    }
  };
  after.forEach((node, index) => {
    if (tree.snapshot()[start + index]?.collabId !== node.collabId)
      tree.moveNode(String(node.collabId), null, start + index, origin);
    update(node);
  });
}
