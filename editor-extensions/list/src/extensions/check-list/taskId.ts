import { Editor, Element as SlateElement, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { ITaskIdSource } from "../../../task-ids";

export const createTaskId = (): string => crypto.randomUUID();

/** 文档序中第一个持有该 taskId 的勾选项路径；重复时只有它保留身份 */
const holders = new WeakMap<Editor, { children: Editor["children"]; paths: Map<string, Path> }>();

function firstHolderPath(editor: Editor, taskId: string): Path | null {
  let cached = holders.get(editor);
  if (!cached || cached.children !== editor.children) {
    const paths = new Map<string, Path>();
    for (const [node, path] of Editor.nodes(editor, {
      at: [],
      match: n => SlateElement.isElement(n) && n.type === "check-list-item",
    })) {
      const id = (node as { taskId?: string }).taskId;
      if (typeof id === "string" && id && !paths.has(id)) paths.set(id, path);
    }
    cached = { children: editor.children, paths };
    holders.set(editor, cached);
  }
  return cached.paths.get(taskId) ?? null;
}

/** 一轮补齐所有缺失或重复身份，避免每次 set_node 后重新扫描整篇正文。 */
export function normalizeTaskIds(editor: Editor): boolean {
  if (ReactEditor.isReadOnly(editor)) return false;
  const seen = new Set<string>();
  const patches: Array<{ path: Path; id: string }> = [];
  for (const [node, path] of Editor.nodes(editor, {
    at: [],
    match: n => SlateElement.isElement(n) && n.type === "check-list-item",
  })) {
    const id = (node as { taskId?: string }).taskId;
    if (typeof id === "string" && id && !seen.has(id)) seen.add(id);
    else {
      const next = createTaskId();
      seen.add(next);
      patches.push({ path, id: next });
    }
  }
  Editor.withoutNormalizing(editor, () => {
    for (const { path, id } of patches) Transforms.setNodes(editor, { taskId: id }, { at: path });
  });
  return patches.length > 0;
}

/**
 * 勾选项是否需要新身份：缺失，或同文档里更早的勾选项已持有同一个 id
 *（回车拆分、复制粘贴会把属性一并复制，后出现者让出身份）。
 */
export function needsNewTaskId(editor: Editor, taskId: string | undefined, path: Path): boolean {
  if (ReactEditor.isReadOnly(editor) || editor.tryGetService?.(ITaskIdSource)?.managed)
    return false;
  if (typeof taskId !== "string" || !taskId) return true;
  const holder = firstHolderPath(editor, taskId);
  return !holder || !Path.equals(holder, path);
}
