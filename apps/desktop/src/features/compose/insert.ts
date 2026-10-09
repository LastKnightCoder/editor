/**
 * 白板资料与正文的连接：插入指向它的行内连接（content-link，与手动加链接同一种节点），或撤掉正文里指向它的连接。
 */

import { Editor, Element, Node, Transforms, type BasePoint } from "slate";
import { ReactEditor } from "slate-react";
import { wrapContentLink } from "@/editor-extensions/content-link/components/utils";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";

export interface LinkTarget {
  ref: EntityRef;
  contentId: number;
  title: string;
}

/** 插入位置：当前选区（折叠到末尾）> 指定块末尾 > 全文末尾 */
function resolvePoint(editor: Editor, block?: number): BasePoint | null {
  if (editor.selection) return Editor.end(editor, editor.selection);
  if (block != null && editor.children[block] && Element.isElement(editor.children[block])) {
    return Editor.end(editor, [block]);
  }
  if (!editor.children.length) return null;
  return Editor.end(editor, []);
}

function focusEditor(editor: Editor) {
  try {
    ReactEditor.focus(editor as ReactEditor);
  } catch {
    // 编辑器不在文档里（栏已收起）：改动照常生效
  }
}

/** 插入成功返回 true；落点在行内元素或空文档等无法插入的位置时返回 false */
export function insertEntityLink(
  editor: Editor,
  target: LinkTarget,
  options: { block?: number } = {}
): boolean {
  const point = resolvePoint(editor, options.block);
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
  focusEditor(editor);
  return true;
}

type LinkNode = Element & {
  type: "content-link";
  contentType?: string;
  refId?: number;
  contentTitle?: string;
};

const isLinkTo = (ref: EntityRef) => (node: Node) =>
  Element.isElement(node) &&
  (node as { type?: string }).type === "content-link" &&
  normalizeEntityRefKind((node as LinkNode).contentType) === ref.kind &&
  (node as LinkNode).refId === ref.id;

/**
 * 撤掉正文里指向 ref 的全部连接，返回处数。
 * 文字就是资料标题的（「引用」按钮插进来的）整段删掉；包着正文原话的只解开连接、留下原话。
 */
export function removeEntityLinks(editor: Editor, ref: EntityRef): number {
  const entries = [...Editor.nodes(editor, { at: [], match: isLinkTo(ref) })];
  if (!entries.length) return 0;
  Editor.withoutNormalizing(editor, () => {
    // 从后往前，前面的路径不受影响
    for (const [node, path] of entries.reverse()) {
      const link = node as LinkNode;
      if (Node.string(link).trim() === (link.contentTitle ?? "").trim()) {
        Transforms.removeNodes(editor, { at: path });
      } else {
        Transforms.unwrapNodes(editor, { at: path });
      }
    }
  });
  return entries.length;
}
