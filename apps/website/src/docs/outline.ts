/** 从 Slate 正文里抽出标题，作为右侧大纲 */
import { Node, type Descendant } from "slate";

export interface OutlineItem {
  level: number;
  title: string;
}

export function extractOutline(value: Descendant[]): OutlineItem[] {
  return value.flatMap(node =>
    "type" in node && node.type === "header" && "level" in node
      ? [{ level: Number(node.level), title: Node.string(node) }]
      : []
  );
}

/** 正文里渲染出的标题元素，顺序与 extractOutline 一致 */
export const queryHeadingElements = (root: ParentNode = document) =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-slate-editor] :is(h1, h2, h3, h4, h5, h6)"));
