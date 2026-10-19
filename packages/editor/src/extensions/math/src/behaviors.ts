import { Node, Path, Transforms } from "slate";
import type { ElementBehaviors } from "@tau/editor/api";
import type { InlineMathElement } from "./types";

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
