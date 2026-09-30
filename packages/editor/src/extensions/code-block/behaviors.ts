import { Editor, Element as SlateElement, Transforms } from "slate";

import type { ElementBehaviors } from "../../api";
import type { CodeBlockElement, ParagraphElement } from "../../types";
import { isAtParagraphStart, isParagraphAndEmpty, isParagraphElement, insertCodeBlock } from "../../utils";
import { codeBlockMap } from "./utils/controllerMaps";

/** 段首退格且前一块是代码块：删掉当前空段落并聚焦代码块的内部编辑器（知识属于 code-block，挂在 paragraph 上） */
const focusCodeBlockBefore: ElementBehaviors<ParagraphElement>["deleteBackward"] = (editor, [, path]) => {
  if (!isAtParagraphStart(editor)) return false;
  const [match] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n) && isParagraphElement(n),
  });
  if (!match) return false;
  // 单元格内等内层场景由各内层元素自己的行为处理，这里只认「前一个兄弟块是 code-block」
  const prevPath = Editor.before(editor, path);
  if (!prevPath) return false;
  const [prevMatch] = Editor.nodes(editor, {
    at: prevPath,
    match: n => SlateElement.isElement(n) && n.type === "code-block",
  });
  if (!prevMatch) return false;

  if (isParagraphAndEmpty(editor)) {
    Transforms.removeNodes(editor, { at: path });
  }
  const [element] = prevMatch;
  const controller = codeBlockMap.get((element as CodeBlockElement).uuid);
  controller?.focus();
  return true;
};

/** 段落整段是 ```language 时回车：变成对应语言的代码块（快捷语法，挂 paragraph 的行为上） */
const insertBreak: ElementBehaviors<ParagraphElement>["insertBreak"] = (editor, [node, path]) => {
  const children = node.children;
  if (children.length !== 1) return false;
  const [text] = children;
  if (text.type !== "formatted") return false;
  if (!text.text.startsWith("```")) return false;

  Editor.withoutNormalizing(editor, () => {
    Transforms.delete(editor, {
      at: {
        anchor: { path: [...path, 0], offset: 0 },
        focus: { path: [...path, 0], offset: text.text.length },
      },
    });
    const language = text.text.slice(3).trim();
    insertCodeBlock(editor, language);
  });
  return true;
};

export const codeBlockForParagraph: ElementBehaviors<ParagraphElement> = {
  deleteBackward: focusCodeBlockBefore,
  insertBreak,
};
