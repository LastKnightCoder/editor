import { Editor, Element as SlateElement, NodeEntry, Range, Transforms } from "slate";

import type { ElementBehaviors } from "../../api";
import type { FormattedText, HeaderElement, ParagraphElement } from "../../types";
import { isAtFirst } from "../utils";
import { focusPreviousBlock, hasBlockNavigation, isInlineElementEmpty } from "../../utils";

/** 标题内的回车：开头在上方插空段落；收起态展开；其余拆行且拆出的后半变普通段落 */
const insertBreak: ElementBehaviors<HeaderElement>["insertBreak"] = (editor, [node, path]) => {
  const { selection } = editor;
  if (selection && Range.isCollapsed(selection) && Editor.isStart(editor, selection.anchor, path)) {
    Editor.withoutNormalizing(editor, () => {
      const nextPath = [...path.slice(0, -1), path[path.length - 1] + 1];
      Transforms.insertNodes(
        editor,
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
        { at: path }
      );
      Transforms.select(editor, Editor.start(editor, nextPath));
    });
    return true;
  }
  if (node.collapsed) {
    Transforms.setNodes(editor, { collapsed: false }, { at: path });
    return true;
  }
  // Slate 默认回车就是 splitNodes({ always: true })，拆出的后半（选区所在）转普通段落
  Transforms.splitNodes(editor, { always: true });
  Transforms.setNodes(editor, { type: "paragraph" });
  Transforms.unsetNodes(editor, "level");
  return true;
};

/** 标题开头的退格：非空不并入前块（跳到前块末尾或整块导航），空标题退化为普通段落 */
const deleteBackward: ElementBehaviors<HeaderElement>["deleteBackward"] = (
  editor,
  [node, path]
) => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  if (!Editor.isStart(editor, selection.anchor, path)) return false;

  const isEmpty = node.children.every(child => isInlineElementEmpty(child, editor));
  if (!isEmpty) {
    const prevBlock = Editor.previous(editor, {
      at: path,
      match: n => SlateElement.isElement(n) && editor.isBlock(n),
    });
    if (prevBlock) {
      const [prevNode, prevPath] = prevBlock as NodeEntry<SlateElement>;
      if (!editor.isVoid(prevNode) && !hasBlockNavigation(prevNode)) {
        Transforms.select(editor, Editor.end(editor, prevPath));
        return true;
      }
      focusPreviousBlock(editor, path, {
        reason: "delete",
        direction: "backward",
      });
    }
    return true;
  }

  Transforms.setNodes(editor, { type: "paragraph" });
  Transforms.unsetNodes(editor, "level");
  Transforms.unsetNodes(editor, "collapsed");
  return true;
};

export const headerBehaviors: ElementBehaviors<HeaderElement> = {
  insertBreak,
  deleteBackward,
};

/** 收起标题下方的段落在开头退格：不并入标题，改为选中标题末尾（知识属于 header，挂在 paragraph 上） */
const quitFromCollapsedHeader: ElementBehaviors<ParagraphElement>["deleteBackward"] = (
  editor,
  [, path]
) => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  if (!Editor.isStart(editor, selection.anchor, path)) return false;
  const prevBlock = Editor.previous(editor, {
    at: path,
    match: n => SlateElement.isElement(n) && editor.isBlock(n),
  });
  if (!prevBlock) return false;
  const [prevNode, prevPath] = prevBlock as NodeEntry<HeaderElement>;
  if (prevNode.type !== "header" || !prevNode.collapsed) return false;
  Transforms.select(editor, Editor.end(editor, prevPath));
  return true;
};

/** 段落开头输入 `#`～`######` 加空格：变成对应级别的标题（快捷语法，挂 paragraph 的行为上） */
const insertMarkdownSyntax: ElementBehaviors<ParagraphElement>["insertText"] = (
  editor,
  _entry,
  text
) => {
  const match = isAtFirst(editor, text);
  if (!match) return false;
  const [node, path] = match as NodeEntry<FormattedText>;
  const levelMatched = (node as FormattedText).text.match(/^#{1,6}/);
  if (!levelMatched) return false;
  const level = levelMatched[0].length as HeaderElement["level"];
  Editor.withoutNormalizing(editor, () => {
    Transforms.delete(editor, {
      at: { anchor: { path, offset: 0 }, focus: { path, offset: level } },
    });
    Transforms.setNodes(editor, { type: "header", level });
  });
  return true;
};

export const headerForParagraph: ElementBehaviors<ParagraphElement> = {
  deleteBackward: quitFromCollapsedHeader,
  insertText: insertMarkdownSyntax,
};
