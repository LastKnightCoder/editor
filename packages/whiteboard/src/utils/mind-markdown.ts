import type { Descendant } from "slate";
import { WHITEBOARD_LIMITS } from "@tau/collaboration";

/** 与导图结构对应的纯数据大纲：节点正文 + 子节点 */
export interface MindOutline {
  text: Descendant[];
  children: MindOutline[];
}

/** 一次粘贴最多转成的节点数，超出的行丢弃 */
export const MIND_OUTLINE_LIMIT = 2000;

export class MindOutlineDepthError extends Error {
  constructor() {
    super("导图层级过深，请减少列表缩进后重试，原内容未改变");
    this.name = "MindOutlineDepthError";
  }
}

type Leaf = {
  type: "formatted";
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strikethrough?: boolean;
};
type Inline = Leaf | { type: "link"; url: string; children: Leaf[] };
type Marks = Omit<Leaf, "type" | "text">;

const MARKS: Array<[keyof Marks, string]> = [
  ["code", "`"],
  ["bold", "**"],
  ["italic", "*"],
  ["strikethrough", "~~"],
];

const URL_ESCAPES: Record<string, string> = { "(": "%28", ")": "%29", " ": "%20" };

const escapeText = (text: string) => text.replace(/[\\`*~[\]]/g, char => `\\${char}`);

const serializeLeaf = (leaf: Leaf) => {
  if (!leaf.text) return "";
  if (leaf.code) {
    const runs = leaf.text.match(/`+/g) ?? [];
    const fence = "`".repeat(runs.reduce((longest, run) => Math.max(longest, run.length), 0) + 1);
    const pad = /^`|`$/.test(leaf.text) || (/^ .* $/.test(leaf.text) && /[^ ]/.test(leaf.text));
    return `${fence}${pad ? " " : ""}${leaf.text}${pad ? " " : ""}${fence}`;
  }
  let out = escapeText(leaf.text);
  for (const [mark, token] of MARKS.slice(1)) if (leaf[mark]) out = `${token}${out}${token}`;
  return out;
};

const serializeInline = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  const value = node as Record<string, unknown>;
  if (typeof value.text === "string") return serializeLeaf(value as unknown as Leaf);
  const children = Array.isArray(value.children)
    ? value.children.map(serializeInline).join("")
    : "";
  if (value.type === "link" && typeof value.url === "string")
    return `[${children}](${value.url.replace(/[()\s]/g, char => URL_ESCAPES[char] ?? char)})`;
  return children;
};

/** 节点正文 → 单行 Markdown（多段落用空格连接） */
export function textToMarkdownLine(text: readonly Descendant[]): string {
  return text
    .map(block => serializeInline(block))
    .filter(line => line.trim())
    .join(" ")
    .replace(/\s*\n\s*/g, " ");
}

/** 大纲 → 两空格缩进的无序列表 */
export function outlineToMarkdown(outline: readonly MindOutline[]): string {
  const lines: string[] = [];
  const visit = (node: MindOutline, depth: number) => {
    lines.push(`${"  ".repeat(depth)}- ${textToMarkdownLine(node.text)}`);
    node.children.forEach(child => visit(child, depth + 1));
  };
  outline.forEach(node => visit(node, 0));
  return lines.join("\n");
}

const leaf = (text: string, marks: Marks): Leaf => ({ type: "formatted", text, ...marks });

const pushLeaf = (out: Inline[], text: string, marks: Marks) => {
  if (!text) return;
  const last = out[out.length - 1];
  if (
    last &&
    last.type === "formatted" &&
    MARKS.every(([mark]) => Boolean(last[mark]) === Boolean(marks[mark]))
  )
    last.text += text;
  else out.push(leaf(text, marks));
};

const codeSpan = (source: string, at: number) => {
  let size = 1;
  while (source[at + size] === "`") size++;
  let start = at + size;
  while (start < source.length) {
    const end = source.indexOf("`", start);
    if (end < 0) return null;
    let run = 1;
    while (source[end + run] === "`") run++;
    if (run === size) {
      let text = source.slice(at + size, end).replace(/\r?\n/g, " ");
      if (text.startsWith(" ") && text.endsWith(" ") && /[^ ]/.test(text)) text = text.slice(1, -1);
      return { text, end: end + run };
    }
    start = end + run;
  }
  return null;
};

/** 行内语法：转义、`代码`、**粗体**、*斜体*、~~删除线~~、[文字](链接)；下划线强调与其他符号原样保留 */
function parseInline(source: string, marks: Marks = {}): Inline[] {
  const out: Inline[] = [];
  let index = 0;
  let plain = "";
  const flush = () => {
    pushLeaf(out, plain, marks);
    plain = "";
  };
  while (index < source.length) {
    const rest = source.slice(index);
    const char = source[index];
    if (char === "\\" && index + 1 < source.length) {
      plain += source[index + 1];
      index += 2;
      continue;
    }
    if (char === "`") {
      const span = codeSpan(source, index);
      if (span) {
        flush();
        pushLeaf(out, span.text, { ...marks, code: true });
        index = span.end;
        continue;
      }
      let size = 1;
      while (source[index + size] === "`") size++;
      plain += source.slice(index, index + size);
      index += size;
      continue;
    }
    if (char === "[") {
      const link = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/.exec(rest);
      if (link) {
        flush();
        const children = parseInline(link[1], marks).filter(
          (node): node is Leaf => node.type === "formatted"
        );
        out.push({ type: "link", url: link[2], children });
        index += link[0].length;
        continue;
      }
    }
    const wrapped = (
      [
        ["**", "bold"],
        ["~~", "strikethrough"],
        ["*", "italic"],
      ] as const
    ).find(([token]) => rest.startsWith(token));
    if (wrapped) {
      const [token, mark] = wrapped;
      const end = findClosing(source, index + token.length, token);
      if (end > index + token.length) {
        flush();
        for (const node of parseInline(source.slice(index + token.length, end), {
          ...marks,
          [mark]: true,
        }))
          if (node.type === "formatted") pushLeaf(out, node.text, node);
          else out.push(node);
        index = end + token.length;
        continue;
      }
    }
    plain += char;
    index += 1;
  }
  flush();
  return out.map(node =>
    node.type === "formatted"
      ? (Object.fromEntries(
          Object.entries(node).filter(([, value]) => value !== undefined && value !== false)
        ) as Leaf)
      : node
  );
}

/**
 * 跳过转义与代码段找闭合标记。单字符标记不能落在双字符标记里（`*` 不吃 `**`）；
 * 连续的同字符（`***`）取末尾作闭合，这样粗斜体 `***x***` 能拆成两层。
 */
function findClosing(source: string, from: number, token: string): number {
  for (let index = from; index < source.length; index++) {
    const char = source[index];
    if (char === "\\") {
      index++;
      continue;
    }
    if (char === "`") {
      const span = codeSpan(source, index);
      if (span) index = span.end - 1;
      continue;
    }
    if (!source.startsWith(token, index)) continue;
    let run = 0;
    while (source[index + run] === token[0]) run++;
    if (token.length === 1 && run === 2) {
      index++;
      continue;
    }
    return index + run - token.length;
  }
  return -1;
}

export function markdownLineToText(line: string): Descendant[] {
  const children = parseInline(line.trim());
  return [
    {
      type: "paragraph",
      children: children.length ? children : [leaf("", {})],
    } as unknown as Descendant,
  ];
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

const indentWidth = (indent: string) =>
  [...indent].reduce((width, char) => width + (char === "\t" ? 4 : 1), 0);

/**
 * Markdown → 大纲：`#` 标题按级别嵌套，列表按缩进嵌套在最近的标题下，
 * 普通文字行按缩进当作列表项；代码块、分隔线、引用符号与空行忽略。
 */
export function markdownToOutline(
  markdown: string,
  limit = MIND_OUTLINE_LIMIT,
  maxDepth: number = WHITEBOARD_LIMITS.payloadDepth
): { outline: MindOutline[]; truncated: boolean } {
  const outline: MindOutline[] = [];
  const headings: Array<{ level: number; node: MindOutline }> = [];
  let items: Array<{ indent: number; node: MindOutline }> = [];
  let count = 0;
  let truncated = false;
  let inFence = false;

  const container = () => headings[headings.length - 1]?.node.children ?? outline;

  for (const raw of markdown.split(/\r?\n/)) {
    if (FENCE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !raw.trim() || RULE.test(raw)) continue;
    if (count >= limit) {
      truncated = true;
      break;
    }
    const line = raw.replace(/^(\s*)>\s?/, "$1");

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
      const node: MindOutline = { text: markdownLineToText(heading[2]), children: [] };
      container().push(node);
      headings.push({ level, node });
      items = [];
      count++;
      continue;
    }

    const item = LIST_ITEM.exec(line);
    const indent = indentWidth(item ? item[1] : (/^\s*/.exec(line)?.[0] ?? ""));
    const content = item ? item[2] : line.trim();
    while (items.length && items[items.length - 1].indent >= indent) items.pop();
    const node: MindOutline = { text: markdownLineToText(content), children: [] };
    (items[items.length - 1]?.node.children ?? container()).push(node);
    items.push({ indent, node });
    count++;
  }
  assertMindOutlineDepth(outline, maxDepth);
  return { outline, truncated };
}

export function outlineDepth(outline: readonly MindOutline[]): number {
  const pending = outline.map(node => ({ node, depth: 1 }));
  let deepest = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    deepest = Math.max(deepest, current.depth);
    for (const node of current.node.children) pending.push({ node, depth: current.depth + 1 });
  }
  return deepest;
}

export function assertMindOutlineDepth(outline: readonly MindOutline[], maxDepth: number) {
  if (outlineDepth(outline) > maxDepth) throw new MindOutlineDepthError();
}
