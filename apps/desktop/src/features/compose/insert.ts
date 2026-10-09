/**
 * 把白板上的资料连进正文：在指定位置插入指向它的行内连接（content-link，与手动加链接同一种节点）。
 * 拖拽经 ENTITY_DRAG_TYPE 传递资料身份。
 */

import { Editor, Element, Node, Transforms, type BasePoint } from "slate";
import { ReactEditor } from "slate-react";
import { wrapContentLink } from "@/editor-extensions/content-link/components/utils";
import type { EntityRef } from "@/entity/ref";

export const ENTITY_DRAG_TYPE = "application/x-tau-entity";

export interface LinkTarget {
  ref: EntityRef;
  contentId: number;
  title: string;
}

export function readDraggedTarget(data: DataTransfer | null): LinkTarget | null {
  const raw = data?.getData(ENTITY_DRAG_TYPE);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LinkTarget>;
    if (!value.ref || !Number.isSafeInteger(value.contentId)) return null;
    return { ref: value.ref, contentId: value.contentId!, title: value.title ?? "" };
  } catch {
    return null;
  }
}

export const isEntityDrag = (data: DataTransfer | null) =>
  Boolean(data?.types.includes(ENTITY_DRAG_TYPE));

/** 插入位置：给定点 > 当前选区（折叠到末尾）> 指定块末尾 > 全文末尾 */
function resolvePoint(editor: Editor, at?: BasePoint, block?: number): BasePoint | null {
  if (at) return at;
  if (editor.selection) return Editor.end(editor, editor.selection);
  if (block != null && editor.children[block] && Element.isElement(editor.children[block])) {
    return Editor.end(editor, [block]);
  }
  if (!editor.children.length) return null;
  return Editor.end(editor, []);
}

/** 插入成功返回 true；落点在行内元素或空文档等无法插入的位置时返回 false */
export function insertEntityLink(
  editor: Editor,
  target: LinkTarget,
  options: { at?: BasePoint; block?: number } = {}
): boolean {
  const point = resolvePoint(editor, options.at, options.block);
  if (!point || !Node.has(editor, point.path)) return false;
  Transforms.select(editor, point);
  const text = Node.get(editor, point.path);
  if (!("text" in text)) return false;
  wrapContentLink(
    editor,
    target.contentId,
    target.ref.kind,
    target.title || "无标题",
    target.ref.id
  );
  try {
    ReactEditor.focus(editor as ReactEditor);
  } catch {
    // 编辑器不在文档里（栏已收起）：插入照常生效
  }
  return true;
}
