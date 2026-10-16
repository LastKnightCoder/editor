/**
 * 来源方言：把 Obsidian / Notion / Logseq 的私有写法在解析前改写成标准 Markdown，
 * 扫描与执行（batch-import）不感知方言。
 * - 文档名解析：[[笔记]] / ![[附件]] 按名称（大小写不敏感，重名取同目录、再取最短路径）定位，
 *   改写为相对路径的标准链接 / 图片，后续沿用相对 .md 链接回填与资源入库。
 * - 只改写代码块与行内代码之外的文本。
 */

import { relativeBundlePath, encodeMarkdownPath } from "./bundle";
import type { TransferSource } from "./source";

export type DialectKey = "generic" | "obsidian" | "notion" | "logseq";

export interface DialectContext {
  /** 当前文档在来源内的相对路径 */
  path: string;
  /** 来源中全部文件（已按方言过滤） */
  files: string[];
  /** 按名称定位文档（不含扩展名，可带目录）；找不到返回 null */
  resolveNote: (name: string) => string | null;
  /** 按名称定位附件（含扩展名，可带目录）；找不到返回 null */
  resolveFile: (name: string) => string | null;
}

export interface DialectOutput {
  markdown: string;
  /** 方言给出的标题（Logseq title::、Notion 去 id），缺省按文件名 */
  title?: string;
  /** 方言内的标签（#tag、tags::），与 frontmatter tags 合并 */
  tags: string[];
  /** 名称解析不到的文档链接（保留为纯文本） */
  unresolvedLinks: string[];
  /** 无法保留的写法（块引用等），进导入报告 */
  notes: string[];
}

export interface SourceDialect {
  key: DialectKey;
  label: string;
  /** 参与导入的文件（排除配置目录等） */
  includeFile: (path: string) => boolean;
  /** 文档在项目树里的结构目录（缺省即实际目录） */
  structuralFolder?: (dir: string[]) => string[];
  /** 文件夹 / 文件名的展示名 */
  displayName: (segment: string) => string;
  transform: (markdown: string, ctx: DialectContext) => DialectOutput;
}

/* ---------- 通用文本工具 ---------- */

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** 逐行改写代码之外的文本：跳过围栏代码块，行内代码原样保留 */
export const mapOutsideCode = (
  markdown: string,
  mapLine: (text: string, line: { whole: string; index: number }) => string
): string => {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line, index) => {
      const match = line.match(FENCE_RE);
      if (fence) {
        if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
        return line;
      }
      if (match) {
        fence = match[1];
        return line;
      }
      // 奇数段为行内代码
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, partIndex) => (partIndex % 2 ? part : mapLine(part, { whole: line, index })))
        .join("");
    })
    .join("\n");
};

const escapeLinkText = (text: string) => text.replace(/([[\]\\])/g, "\\$1");

const dirOf = (path: string) => path.split("/").slice(0, -1);
const extOf = (name: string) => {
  const match = name.match(/\.([^./]+)$/);
  return match ? match[1].toLowerCase() : "";
};
const stemOf = (name: string) => name.replace(/\.[^./]+$/, "");

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);
const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac", "webm"]);
const VIDEO_EXT = new Set(["mp4", "mov", "mkv", "ogv"]);

/** 从 from 文档到 to 文件的相对链接目标（已编码，可直接写进 Markdown） */
const linkTarget = (from: string, to: string) =>
  encodeMarkdownPath(relativeBundlePath(dirOf(from), to.split("/")));

/** 正文里的 #标签（排除纯数字与 URL 片段） */
const INLINE_TAG_RE = /(?:^|[\s(（，,])#([^\s#.,;:!?()[\]{}"'`，。；：！？、（）]+)/g;

export const collectInlineTags = (markdown: string) => {
  const tags = new Set<string>();
  mapOutsideCode(markdown, text => {
    for (const match of text.matchAll(INLINE_TAG_RE)) {
      const tag = match[1].replace(/\/+$/, "");
      if (tag && !/^\d+$/.test(tag)) tags.add(tag);
    }
    return text;
  });
  return [...tags];
};

/** ==高亮== → 高亮 directive（不跨行，两侧不能是空白，避免误伤 a == b） */
const convertHighlights = (text: string) =>
  text.replace(/==(?=\S)([^=\n]*?\S)==/g, (_, inner: string) => `:highlight[${inner}]`);

const CALLOUT_TYPE: Record<string, string> = {
  note: "note",
  abstract: "info",
  summary: "info",
  tldr: "info",
  info: "info",
  todo: "info",
  question: "info",
  help: "info",
  faq: "info",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "tip",
  check: "tip",
  done: "tip",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "danger",
  fail: "danger",
  missing: "danger",
  danger: "danger",
  error: "danger",
  bug: "danger",
  example: "note",
  quote: "note",
  cite: "note",
};

/**
 * > [!type] 标题 引用块（Obsidian callout / GitHub alert）→ callout directive；
 * 只认顶层引用块，类型不认识按 note。
 */
export const convertCallouts = (markdown: string) => {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0]) fence = null;
      out.push(line);
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }
    const head = line.match(/^>\s*\[!([\w-]+)\][+-]?\s*(.*)$/);
    if (!head) {
      out.push(line);
      continue;
    }
    const type = CALLOUT_TYPE[head[1].toLowerCase()] ?? "note";
    const title = head[2].trim().replace(/"/g, "'");
    const body: string[] = [];
    while (i + 1 < lines.length && /^>/.test(lines[i + 1])) {
      i += 1;
      body.push(lines[i].replace(/^>\s?/, ""));
    }
    out.push(`:::${type}${title ? `{title="${title}"}` : ""}`, ...body, ":::");
  }
  return out.join("\n");
};

/* ---------- 名称解析 ---------- */

const normalizeName = (value: string) => value.trim().replace(/\\/g, "/").toLowerCase();

/**
 * 名称 → 路径索引（Obsidian「最短路径」语义）：带目录的先按来源根、再按当前目录匹配，
 * 再按路径后缀；只有文件名的按文件名，重名优先同目录、再取路径最短。
 */
export const createNameResolver = (paths: string[], keyOf: (path: string) => string) => {
  const byKey = new Map<string, string[]>();
  const byFull = new Map<string, string>();
  for (const path of paths) {
    const full = normalizeName(keyOf(path));
    byFull.set(full, path);
    const base = full.split("/").pop() || full;
    byKey.set(base, [...(byKey.get(base) ?? []), path]);
  }
  return (rawName: string, fromPath: string): string | null => {
    const name = normalizeName(rawName).replace(/^\.\//, "").replace(/^\/+/, "");
    if (!name) return null;
    if (name.includes("/")) {
      const fromDir = dirOf(fromPath).join("/").toLowerCase();
      const relative = fromDir ? `${fromDir}/${name}` : name;
      const hit =
        byFull.get(name) ??
        byFull.get(relative) ??
        [...byFull].find(([full]) => full.endsWith(`/${name}`))?.[1];
      if (hit) return hit;
    }
    const candidates = byKey.get(name.split("/").pop() || name);
    if (!candidates?.length) return null;
    if (candidates.length === 1) return candidates[0];
    const sameDir = candidates.find(path => dirOf(path).join("/") === dirOf(fromPath).join("/"));
    return sameDir ?? [...candidates].sort((a, b) => a.length - b.length)[0];
  };
};

/* ---------- 维基链接（Obsidian / Logseq 共用） ---------- */

const WIKI_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;

interface WikiOptions {
  /** [[目标|别名]] 的别名分隔（Logseq 没有别名语法） */
  aliases: boolean;
}

const convertWikiLinks = (
  text: string,
  line: string,
  ctx: DialectContext,
  out: Pick<DialectOutput, "unresolvedLinks">,
  options: WikiOptions
) =>
  text.replace(WIKI_RE, (whole, bang: string, inner: string) => {
    const [rawTarget, ...aliasParts] = options.aliases ? inner.split(/\\?\|/) : [inner];
    const alias = aliasParts.join("|").trim();
    const target = rawTarget.trim();
    // [[#标题]] / [[^块]]：指向本文内部，降为文字
    const notePart = target.split(/#/)[0].trim();
    if (!notePart) return alias || target.replace(/^#\^?/, "");

    const ext = extOf(notePart);
    if (bang && ext && ext !== "md") {
      const file = ctx.resolveFile(notePart);
      const display = alias && !/^\d+(x\d+)?$/.test(alias) ? alias : "";
      if (IMAGE_EXT.has(ext)) {
        // 找不到也写成图片，由资源扫描记为缺失
        return `![${escapeLinkText(display)}](${file ? linkTarget(ctx.path, file) : encodeMarkdownPath(notePart)})`;
      }
      if (!file) {
        out.unresolvedLinks.push(notePart);
        return notePart;
      }
      // 音视频与其它附件是块级元素，只在独占一行时生成
      if (line.trim() === whole) {
        const src = linkTarget(ctx.path, file).replace(/"/g, "%22");
        if (AUDIO_EXT.has(ext)) return `:::audio{src="${src}"}\n:::`;
        if (VIDEO_EXT.has(ext)) return `:::video{src="${src}"}\n:::`;
        const fileName = (file.split("/").pop() || notePart).replace(/"/g, "'");
        return `:::file-attachment{fileName="${fileName}" filePath="${src}" isLocal=true}\n:::`;
      }
      return display || notePart;
    }

    const note = ctx.resolveNote(ext === "md" ? stemOf(notePart) : notePart);
    const label = alias || notePart.split("/").pop() || notePart;
    if (!note) {
      out.unresolvedLinks.push(notePart);
      return label;
    }
    // ![[笔记]] 嵌入无法展开，降为链接
    return `[${escapeLinkText(label)}](${linkTarget(ctx.path, note)})`;
  });

const emptyOutput = (markdown: string): DialectOutput => ({
  markdown,
  tags: [],
  unresolvedLinks: [],
  notes: [],
});

/* ---------- 各方言 ---------- */

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

export const genericDialect: SourceDialect = {
  key: "generic",
  label: "通用 Markdown",
  includeFile: () => true,
  displayName: segment => segment,
  transform: markdown => emptyOutput(convertCallouts(markdown)),
};

export const obsidianDialect: SourceDialect = {
  key: "obsidian",
  label: "Obsidian",
  includeFile: () => true,
  displayName: segment => segment,
  transform: (markdown, ctx) => {
    const output = emptyOutput("");
    // %% 注释 %%（可跨行）不导入
    const withoutComments = markdown.replace(/%%[\s\S]*?%%/g, "");
    output.tags = collectInlineTags(withoutComments);
    const converted = mapOutsideCode(convertCallouts(withoutComments), (text, line) =>
      convertHighlights(
        convertWikiLinks(text, line.whole, ctx, output, { aliases: true })
          // 行尾块标识 ^abc123
          .replace(/\s\^[A-Za-z0-9-]+\s*$/, "")
      )
    );
    output.markdown = converted;
    return output;
  },
};

/** Notion 导出名末尾的 32 位 id（新旧导出：空格 + 32 位十六进制） */
const NOTION_ID_RE = /\s+[0-9a-f]{32}(?=(\.[^./]+)?$)/i;

export const stripNotionId = (name: string) => name.replace(NOTION_ID_RE, "");

export const notionDialect: SourceDialect = {
  key: "notion",
  label: "Notion",
  includeFile: () => true,
  displayName: stripNotionId,
  transform: (markdown, ctx) => {
    const output = emptyOutput(markdown);
    const title = stripNotionId(stemOf(ctx.path.split("/").pop() || ""));
    output.title = title;
    const lines = markdown.replace(/^\uFEFF/, "").split("\n");
    // 首行 # 标题与文件名重复，去掉；紧随其后的「属性: 值」行里取 Tags
    if (lines[0]?.replace(/^#\s+/, "").trim() === title && /^#\s/.test(lines[0])) {
      lines.shift();
      while (lines[0] !== undefined && lines[0].trim() === "") lines.shift();
    }
    for (const line of lines) {
      if (!line.trim()) break;
      const property = line.match(/^(Tags|标签|Tag)\s*[:：]\s*(.+)$/i);
      if (property) {
        output.tags.push(
          ...property[2]
            .split(/[,，]/)
            .map(tag => tag.trim())
            .filter(Boolean)
        );
      } else if (!/^[^:：\n]{1,40}[:：]\s/.test(line)) {
        break;
      }
    }
    output.markdown = lines.join("\n");
    return output;
  },
};

/** Logseq 页面文件名 → 页面名：新格式 ___ 为命名空间分隔，旧格式 %2F 编码 */
export const logseqPageName = (path: string) => {
  const stem = stemOf(path.split("/").pop() || "");
  let name = stem.replace(/___/g, "/");
  try {
    name = decodeURIComponent(name);
  } catch {
    // 保留原文件名
  }
  return name;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORDINAL_SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (day: number) =>
  `${day}${day % 100 >= 11 && day % 100 <= 13 ? "th" : (ORDINAL_SUFFIX[day % 10] ?? "th")}`;

/** 日志文件 2024_01_15.md 的各种引用名：默认显示格式 Jan 15th, 2024 与 ISO 日期 */
export const logseqJournalNames = (path: string): string[] => {
  const match = stemOf(path.split("/").pop() || "").match(/^(\d{4})[_-](\d{2})[_-](\d{2})$/);
  if (!match) return [];
  const [, year, month, day] = match;
  return [
    `${MONTHS[Number(month) - 1]} ${ordinal(Number(day))}, ${year}`,
    `${year}-${month}-${day}`,
    `${year}_${month}_${day}`,
    `${year}/${month}/${day}`,
  ];
};

const LOGSEQ_PROPERTY_RE = /^\s*(?:-\s+)?([A-Za-z][\w-]*)::\s*(.*)$/;
const TASK_MARKERS: Record<string, string> = {
  TODO: "[ ]",
  LATER: "[ ]",
  NOW: "[ ]",
  DOING: "[ ]",
  WAITING: "[ ]",
  WAIT: "[ ]",
  DONE: "[x]",
  CANCELED: "[x]",
  CANCELLED: "[x]",
};

const splitValues = (value: string) =>
  value
    .split(",")
    .map(item =>
      item
        .trim()
        .replace(/^\[\[|\]\]$/g, "")
        .replace(/^#/, "")
    )
    .filter(Boolean);

export const logseqDialect: SourceDialect = {
  key: "logseq",
  label: "Logseq",
  // 配置、备份、白板与版本文件不导入
  includeFile: path => !/^(logseq|whiteboards|version-files|draws)\//.test(path),
  // pages/ 摊平到根，journals/ 归入「日志」
  structuralFolder: dir =>
    dir[0] === "pages" ? dir.slice(1) : dir[0] === "journals" ? ["journals", ...dir.slice(1)] : dir,
  displayName: segment => (segment === "journals" ? "日志" : segment),
  transform: (markdown, ctx) => {
    const output = emptyOutput("");
    const lines = markdown.replace(/^\uFEFF/, "").split("\n");

    // 页面属性：文件开头连续的 key:: value 行
    let start = 0;
    while (start < lines.length) {
      const property = lines[start].match(LOGSEQ_PROPERTY_RE);
      if (!property) break;
      const [, key, value] = property;
      if (key.toLowerCase() === "title" && value.trim()) output.title = value.trim();
      if (key.toLowerCase() === "tags") output.tags.push(...splitValues(value));
      start += 1;
    }
    let blockRefs = 0;
    const body = lines
      .slice(start)
      // 块属性（id:: / collapsed:: …）不导入
      .filter(line => !/^\s+[A-Za-z][\w-]*::\s/.test(line) || /^\s*-\s/.test(line))
      .join("\n");

    const converted = mapOutsideCode(body, (text, line) => {
      let next = text
        // [显示文字]([[页面]]) → [[页面|显示文字]] 再统一处理
        .replace(/\[([^\]\n]+)\]\(\[\[([^\]\n]+)\]\]\)/g, "[[$2|$1]]")
        // #[[多词标签]] → #多词标签
        .replace(/#\[\[([^\]\n]+)\]\]/g, (_, tag: string) => `#${tag.replace(/\s+/g, "-")}`)
        .replace(/\(\(([0-9a-f-]{36})\)\)/gi, () => {
          blockRefs += 1;
          return "";
        })
        .replace(/\^\^(?=\S)([^^\n]*?\S)\^\^/g, "==$1==");
      next = convertHighlights(convertWikiLinks(next, line.whole, ctx, output, { aliases: true }));
      // 列表项开头的任务标记 → 任务列表；换用 * 标记让连续任务项自成一个列表
      // （CommonMark 换列表符即新列表），不和普通条目混排而丢失勾选状态
      next = next.replace(
        /^(\s*)-(\s+)(TODO|LATER|NOW|DOING|WAITING|WAIT|DONE|CANCELED|CANCELLED)\s+/,
        (_, indent: string, gap: string, marker: string) =>
          `${indent}*${gap}${TASK_MARKERS[marker]} `
      );
      return next;
    });
    output.tags.push(...collectInlineTags(converted));
    output.tags = [...new Set(output.tags)];
    if (blockRefs > 0) output.notes.push(`${blockRefs} 处块引用 ((…)) 无法保留，已移除`);
    output.markdown = converted;
    return output;
  },
};

export const DIALECTS: Record<DialectKey, SourceDialect> = {
  generic: genericDialect,
  obsidian: obsidianDialect,
  notion: notionDialect,
  logseq: logseqDialect,
};

/** 自动识别：Logseq 配置 > .obsidian 目录 > 过半文件名带 Notion id > 通用 */
export const detectDialect = (source: TransferSource): DialectKey => {
  if (source.files.includes("logseq/config.edn")) return "logseq";
  if (source.markers.includes(".obsidian")) return "obsidian";
  const markdown = source.files.filter(isMarkdown);
  const withId = markdown.filter(path => NOTION_ID_RE.test(path.split("/").pop() || ""));
  if (markdown.length > 0 && withId.length * 2 >= markdown.length) return "notion";
  return "generic";
};

/** 名称解析器：文档按无扩展名路径，Logseq 另按页面名、title:: 与日志日期 */
export const createDialectResolvers = (
  dialect: SourceDialect,
  files: string[],
  extraNoteNames: Map<string, string> = new Map()
) => {
  const notes = files.filter(isMarkdown);
  const resolveNotePath = createNameResolver(notes, path =>
    dialect.key === "logseq" ? logseqPageName(path) : stemOf(path)
  );
  const aliases = new Map<string, string>();
  if (dialect.key === "logseq") {
    for (const path of notes) {
      for (const name of logseqJournalNames(path)) aliases.set(normalizeName(name), path);
    }
  }
  for (const [name, path] of extraNoteNames) aliases.set(normalizeName(name), path);
  const resolveFilePath = createNameResolver(
    files.filter(path => !isMarkdown(path)),
    path => path
  );
  return {
    resolveNote: (name: string, from: string) =>
      aliases.get(normalizeName(name)) ?? resolveNotePath(name, from),
    resolveFile: (name: string, from: string) => resolveFilePath(name, from),
  };
};
