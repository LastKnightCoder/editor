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

/** 地址锚点与标题的对应：按 GitHub 的规则生成，作者在 GitHub 上写的 #锚点 链接在这里同样能用 */
export const headingAnchor = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
