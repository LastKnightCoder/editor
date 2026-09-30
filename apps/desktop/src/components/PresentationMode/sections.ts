/**
 * 演示分节：断页只看文档结构，不看内容高度。
 * 有分割线按分割线断；否则按「至少出现两次的最高级标题」断；都没有则整篇一节。
 */
import { Element, Node, Text, type Descendant } from "slate";

interface HeaderLike {
  type: "header";
  level: number;
}

function isDivider(node: Descendant) {
  return Element.isElement(node) && node.type === "divide-line";
}

export function isHeader(node: Descendant): node is Descendant & HeaderLike {
  return Element.isElement(node) && node.type === "header";
}

/** 只含空段落的节（分割线前后的空行）不成节 */
function isBlankSection(section: Descendant[]) {
  return section.every(
    node =>
      Element.isElement(node) &&
      node.type === "paragraph" &&
      node.children.every(child => Text.isText(child) && child.text.trim() === "")
  );
}

/** 断节标题级别：级别最高且出现不少于两次（单个 H1 文档标题不拿来断节） */
function sectionLevel(content: Descendant[]): number | null {
  const counts = new Map<number, number>();
  for (const node of content) {
    if (isHeader(node)) counts.set(node.level, (counts.get(node.level) ?? 0) + 1);
  }
  const levels = [...counts.keys()].sort((a, b) => a - b);
  return levels.find(level => (counts.get(level) ?? 0) >= 2) ?? null;
}

export function splitSections(content: Descendant[]): Descendant[][] {
  const sections: Descendant[][] = [];
  let current: Descendant[] = [];
  const flush = () => {
    if (current.length > 0 && !isBlankSection(current)) sections.push(current);
    current = [];
  };

  if (content.some(isDivider)) {
    for (const node of content) {
      if (isDivider(node)) flush();
      else current.push(node);
    }
  } else {
    const level = sectionLevel(content);
    for (const node of content) {
      if (level !== null && isHeader(node) && node.level <= level) flush();
      current.push(node);
    }
  }
  flush();
  return sections.length > 0 ? sections : [content];
}

/** 节标题：节内第一个标题的纯文本 */
export function sectionTitle(section: Descendant[]): string {
  const header = section.find(isHeader);
  return header ? Node.string(header).trim() : "";
}
