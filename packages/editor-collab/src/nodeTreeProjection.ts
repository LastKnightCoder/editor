import { Editor, Element, Node, Path, Text, Transforms, type Descendant } from "slate";
import diff from "fast-diff";

export function nodeIdentity(node: unknown): string | undefined {
  const id = (node as { collabId?: unknown } | undefined)?.collabId;
  return typeof id === "string" ? id : undefined;
}

export function findNodePath(editor: Editor, id: string): number[] | undefined {
  for (const [node, path] of Node.descendants(editor)) {
    if (nodeIdentity(node) === id) return path;
  }
}

const attributes = (node: Descendant): Record<string, unknown> =>
  Object.fromEntries(Object.entries(node).filter(([key]) => key !== "children" && key !== "text"));

/** 用普通 Slate 操作更新投影，保持选区和 PathRef 的转换语义。 */
export function projectNodeTree(editor: Editor, next: Descendant[], onlyNode?: string): void {
  const parents: { id?: string; count: number }[] = [];
  const visit = (
    parentId: string | undefined,
    children: Descendant[],
    start = 0,
    partial = false
  ) => {
    if (!partial) parents.push({ id: parentId, count: children.length });
    for (let index = 0; index < children.length; index++) {
      const nextNode = children[index];
      const parentPath = parentId ? findNodePath(editor, parentId) : [];
      if (!parentPath) throw new Error("投影父节点不存在");
      const target = [...parentPath, start + index];
      const id = nodeIdentity(nextNode);
      if (id) {
        const existing = findNodePath(editor, id);
        if (existing && !Path.equals(existing, target)) {
          Transforms.moveNodes(editor, { at: existing, to: target, voids: true });
        } else if (!existing) {
          editor.apply({ type: "insert_node", path: target, node: nextNode });
        }
      } else if (!Node.has(editor, target) || !Text.isText(Node.get(editor, target))) {
        editor.apply({ type: "insert_node", path: target, node: nextNode });
      }
      const current = Node.get(editor, target) as Descendant;
      const previousProperties = attributes(current);
      const nextProperties = attributes(nextNode);
      const properties: Record<string, unknown> = {};
      const newProperties: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(previousProperties),
        ...Object.keys(nextProperties),
      ])) {
        if (JSON.stringify(previousProperties[key]) !== JSON.stringify(nextProperties[key])) {
          properties[key] = previousProperties[key];
          newProperties[key] = nextProperties[key];
        }
      }
      if (Object.keys(newProperties).length) {
        editor.apply({ type: "set_node", path: target, properties, newProperties });
      }
      if (Text.isText(current) && Text.isText(nextNode)) {
        let offset = 0;
        for (const [kind, text] of diff(current.text, nextNode.text)) {
          if (kind === -1) editor.apply({ type: "remove_text", path: target, offset, text });
          else {
            if (kind === 1) editor.apply({ type: "insert_text", path: target, offset, text });
            offset += text.length;
          }
        }
      } else if (Element.isElement(nextNode)) visit(id, nextNode.children);
    }
  };
  Editor.withoutNormalizing(editor, () => {
    const path = onlyNode ? findNodePath(editor, onlyNode) : undefined;
    if (onlyNode && !path) return;
    if (path) {
      const parent = Node.get(editor, Path.parent(path));
      visit(
        Editor.isEditor(parent) ? undefined : nodeIdentity(parent),
        next,
        path[path.length - 1],
        true
      );
    } else visit(undefined, next);
    // 跨父节点移动完成后再删尾部，避免先删掉稍后需要移走的节点。
    for (const { id, count } of parents.reverse()) {
      const path = id ? findNodePath(editor, id) : [];
      if (!path) continue;
      const node = Node.get(editor, path) as Editor | Element;
      for (let index = node.children.length - 1; index >= count; index--) {
        const target = [...path, index];
        editor.apply({
          type: "remove_node",
          path: target,
          node: Node.get(editor, target) as Descendant,
        });
      }
    }
  });
}
