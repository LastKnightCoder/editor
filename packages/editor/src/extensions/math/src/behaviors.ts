import { Editor, Node, Path, Transforms } from "slate";
import type { ElementBehaviors, ParagraphElement } from "@tau/editor/api";
import type { InlineMathElement } from "./types";
import { insertBlockMath } from "./insert";

/** 首尾或相邻公式保留零宽光标落点。 */
export const normalizeInlineMath: ElementBehaviors<InlineMathElement>["normalize"] = (
  editor,
  [, path]
) => {
  const parent = Node.parent(editor, path);
  const first = !Path.hasPrevious(path);
  const last = path[path.length - 1] === parent.children.length - 1;
  const adjacent = !first && Node.get(editor, Path.previous(path)).type === "inline-math";
  if (last)
    Transforms.insertNodes(editor, { type: "formatted", text: "\uFEFF" }, { at: Path.next(path) });
  if (first || adjacent)
    Transforms.insertNodes(editor, { type: "formatted", text: "\uFEFF" }, { at: path });
  return first || last || adjacent;
};

/** 段落里只有 `$$` 时回车：整段变成块级公式并进入编辑（快捷语法，挂 paragraph 的行为上） */
export const convertDollarsToBlockMath: ElementBehaviors<ParagraphElement>["insertBreak"] = (
  editor,
  [paragraph, path]
) => {
  const [text] = paragraph.children;
  if (paragraph.children.length !== 1 || text.type !== "formatted" || text.text !== "$$")
    return false;
  Editor.withoutNormalizing(editor, () => {
    Transforms.delete(editor, {
      at: { anchor: { path: [...path, 0], offset: 0 }, focus: { path: [...path, 0], offset: 2 } },
    });
    insertBlockMath(editor);
  });
  return true;
};
