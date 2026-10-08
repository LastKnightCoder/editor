import { Editor, Element as SlateElement, Path } from "slate";

export const createTaskId = (): string => crypto.randomUUID();

/** 文档序中第一个持有该 taskId 的勾选项路径；重复时只有它保留身份 */
function firstHolderPath(editor: Editor, taskId: string): Path | null {
  for (const [, path] of Editor.nodes(editor, {
    at: [],
    match: n => SlateElement.isElement(n) && n.type === "check-list-item" && n.taskId === taskId,
  }))
    return path;
  return null;
}

/**
 * 勾选项是否需要新身份：缺失，或同文档里更早的勾选项已持有同一个 id
 *（回车拆分、复制粘贴会把属性一并复制，后出现者让出身份）。
 */
export function needsNewTaskId(editor: Editor, taskId: string | undefined, path: Path): boolean {
  if (!taskId) return true;
  const holder = firstHolderPath(editor, taskId);
  return !holder || !Path.equals(holder, path);
}
