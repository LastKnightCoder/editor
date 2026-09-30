import { Transforms } from "slate";

import type { ElementBehaviors } from "../../api";
import type { CalloutElement } from "../../types";
import { hitDoubleQuit, hitEmptyOrInlineChild } from "../utils";
import { isParagraphAndEmpty } from "../../utils";

/** callout 在第一行且内容为空时，退格删除 callout 并落回空段落 */
const deleteBackward: ElementBehaviors<CalloutElement>["deleteBackward"] = (
  editor,
  [node, path]
) => {
  const isFirst = path[path.length - 1] === 0;
  const isEmpty =
    node.children.length === 1 &&
    node.children[0].type === "paragraph" &&
    isParagraphAndEmpty(editor);
  if (!isFirst || !isEmpty) return false;
  Transforms.delete(editor, { at: path });
  Transforms.insertNodes(
    editor,
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
    { at: path, select: true }
  );
  return true;
};

/** 最后一个空段落里回车：退出 callout（首段 lift，其余删段并在下方补空段落） */
const insertBreak: ElementBehaviors<CalloutElement>["insertBreak"] = editor =>
  hitDoubleQuit(editor, "callout");

/** callout 的子节点只允许块级元素：空 / 裸文本子节点清掉或包进段落 */
const normalize: ElementBehaviors<CalloutElement>["normalize"] = (editor, entry) =>
  hitEmptyOrInlineChild(editor, entry, "callout");

export const calloutBehaviors: ElementBehaviors<CalloutElement> = {
  deleteBackward,
  insertBreak,
  normalize,
};
