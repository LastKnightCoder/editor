import { Element, type Descendant, type Editor, type Node } from "slate";

/** 剪贴板插入是新任务；原位拖拽和层级移动不经过 insertFragment。 */
export function withTaskFragmentIdentity(editor: Editor): Editor {
  const insertFragment = editor.insertFragment;
  const copy = (node: Node): Node => {
    if (!Element.isElement(node)) return { ...node };
    const children = node.children.map(copy);
    if (node.type !== "check-list-item") return { ...node, children } as Descendant;
    return {
      ...node,
      children,
      taskId: undefined,
      ...("taskOccurrenceState" in node || "taskCompletedAt" in node
        ? { taskOccurrenceState: {}, taskCompletedAt: null }
        : {}),
    } as Descendant;
  };
  editor.insertFragment = (fragment, options) => insertFragment(fragment.map(copy), options);
  return editor;
}
