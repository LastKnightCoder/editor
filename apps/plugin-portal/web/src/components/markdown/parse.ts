/**
 * 介绍字段的最小 Markdown 子集解析：标题、段落、列表、引用、代码块、分隔线，
 * 行内代码 / 粗体 / 斜体 / 链接。输出纯数据树，由 React 渲染为文本节点，
 * 原始 HTML 一律按字面文字显示；图片不加载远程地址，只显示替代文字。
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "image"; alt: string }
  | { type: "break" };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "quote"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; lang: string; text: string }
  | { type: "rule" };

const FENCE = /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;

const startsBlock = (line: string) =>
  FENCE.test(line) ||
  HEADING.test(line) ||
  RULE.test(line) ||
  QUOTE.test(line) ||
  BULLET.test(line) ||
  ORDERED.test(line);

/** 只允许跳转到网页或邮件；javascript:、data: 等一律降级为纯文本 */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) nodes.push({ type: "text", text });
    text = "";
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const char = source[i];
    if (char === "\\" && i + 1 < source.length && /[\\`*_[\]()#>!-]/.test(source[i + 1])) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (char === "\n") {
      flush();
      nodes.push({ type: "break" });
      i += 1;
      continue;
    }
    if (char === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest);
    if (image) {
      flush();
      nodes.push({ type: "image", alt: image[1] });
      i += image[0].length;
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      const href = safeHref(link[2]);
      const children = parseInline(link[1]);
      if (href) nodes.push({ type: "link", href, children });
      else nodes.push(...children);
      i += link[0].length;
      continue;
    }
    const auto = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?，。；：！？]/.exec(rest);
    if (auto && (i === 0 || !/\w/.test(source[i - 1]))) {
      const href = safeHref(auto[0]);
      if (href) {
        flush();
        nodes.push({ type: "link", href, children: [{ type: "text", text: auto[0] }] });
        i += auto[0].length;
        continue;
      }
    }
    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const end = source.indexOf(marker, i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((char === "*" || char === "_") && source[i + 1] && source[i + 1] !== " ") {
      const wordInside = char === "_" && i > 0 && /\w/.test(source[i - 1]);
      const end = source.indexOf(char, i + 1);
      if (!wordInside && end > i + 1 && source[end - 1] !== " ") {
        flush();
        nodes.push({ type: "em", children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    text += char;
    i += 1;
  }
  flush();
  return nodes;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i += 1;
      blocks.push({ type: "code", lang: fence[2], text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])![1]);
      blocks.push({ type: "quote", children: parseInline(body.join("\n")) });
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const item = pattern.exec(lines[i]);
        if (item) items.push(item[1]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] += "\n" + lines[i].trim();
        } else break;
        i += 1;
      }
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && (body.length === 0 || !startsBlock(lines[i]))) {
      body.push(lines[i++].trim());
    }
    blocks.push({ type: "paragraph", children: parseInline(body.join("\n")) });
  }
  return blocks;
}
