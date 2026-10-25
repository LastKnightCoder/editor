import { Node, Text, type Descendant } from "slate";
import { getMarkdown } from "../utils/markdown";
import { smartChunkWithRanges } from "../../src-electron/main/utils/smart-chunk";

export { MAIN_CHUNK_VERSION } from "./chunk-version";
export const SECTION_MAX_LENGTH = 1200;
export const SECTION_MIN_LENGTH = 80;
/** 卡片、摘录整篇一节，但超长时仍按长度切块：远程嵌入接口有单次输入上限 */
export const WHOLE_MIN_LENGTH = 500;
export const WHOLE_MAX_LENGTH = 2000;

/** 每个顶层块所在节的标题路径「一级 › 二级」（标题块包含自身） */
export function headingPaths(content: Descendant[]): string[] {
  const ancestors: { level: number; title: string }[] = [];
  return content.map(node => {
    if (!Text.isText(node) && node.type === "header") {
      const level = Number(node.level);
      while (ancestors.length && ancestors[ancestors.length - 1].level >= level) ancestors.pop();
      ancestors.push({ level, title: Node.string(node) });
    }
    return ancestors.map(item => item.title).join(" › ");
  });
}

export interface ContentSection {
  chunkIndex: number;
  headingPath: string;
  text: string;
  blockStart: number;
  blockEnd: number;
  charCount: number;
  embeddingText: string;
}

export function splitSections(
  content: Descendant[],
  title: string,
  whole = false,
  limits = { minLength: SECTION_MIN_LENGTH, maxLength: SECTION_MAX_LENGTH },
  serialize: (nodes: Descendant[]) => string = getMarkdown
): ContentSection[] {
  if (!content.length) return [];
  const paths = headingPaths(content);
  const counts = new Map<number, number>();
  for (const node of content) {
    if (!Text.isText(node) && node.type === "header")
      counts.set(node.level, (counts.get(node.level) ?? 0) + 1);
  }
  const level = [...counts.keys()].sort((a, b) => a - b).find(value => counts.get(value)! >= 2);
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  content.forEach((node, index) => {
    if (
      !whole &&
      index > 0 &&
      level !== undefined &&
      !Text.isText(node) &&
      node.type === "header" &&
      node.level <= level
    ) {
      ranges.push({ start, end: index - 1 });
      start = index;
    }
  });
  ranges.push({ start, end: content.length - 1 });
  const markdown = content.map(node => serialize([node]));
  const sections: ContentSection[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = { ...ranges[i] };
    while (
      i + 1 < ranges.length &&
      markdown
        .slice(range.start, range.end + 1)
        .join("\n\n")
        .trim().length < limits.minLength
    ) {
      range.end = ranges[++i].end;
    }
    const parts = markdown.slice(range.start, range.end + 1);
    const text = parts.join("\n\n");
    let offset = 0;
    const starts = parts.map(part => {
      const result = offset;
      offset += part.length + 2;
      return result;
    });
    const blockAt = (position: number) => {
      let block = 0;
      while (block + 1 < starts.length && starts[block + 1] <= position) block++;
      return range.start + block;
    };
    const chunks = smartChunkWithRanges(text, {
      minLength: whole ? WHOLE_MIN_LENGTH : limits.minLength,
      maxLength: whole ? WHOLE_MAX_LENGTH : limits.maxLength,
      overlap: 0,
      splitter: "paragraph",
    });
    for (const chunk of chunks) {
      if (!chunk.text.trim()) continue;
      const headingPath = paths[range.start];
      sections.push({
        chunkIndex: sections.length,
        headingPath,
        text: chunk.text,
        blockStart: blockAt(chunk.startOffset),
        blockEnd: blockAt(Math.max(chunk.startOffset, chunk.endOffset - 1)),
        charCount: chunk.text.length,
        embeddingText: [[title, headingPath].filter(Boolean).join(" › "), chunk.text]
          .filter(Boolean)
          .join("\n\n"),
      });
    }
  }
  return sections;
}
