/**
 * AI 洞见的提示词、输出解析与校验（纯函数，KL-058）。
 *
 * 本文按节编号给模型；模型给出「节号 + 原文片段 + 候选编号」，这里逐条核对：片段必须逐字出现在该节某个
 * 顶层块的正文文字里（不跨块、不落在已有链接等行内元素上），候选编号必须存在；对不上的丢弃，
 * 防止模型编造位置与对象。
 */

import type { Descendant } from "slate";
import type { ContentSection } from "@/entity/sections";
import type { InsightKind, InsightMark } from "@/types/content-insights";

export const INSIGHT_BODY_MAX_CHARS = 6000;
export const INSIGHT_MAX_MARKS = 6;
export const INSIGHT_MAX_ASKS = 2;
/** 「可以展开」每篇最多几条：它不需要候选、最容易写，多了会把连接挤掉 */
export const INSIGHT_MAX_GAPS = 2;
/** 片段不能落在上面的位置（行内元素、代码）在块文字里的占位字符 */
export const INLINE_PLACEHOLDER = "\u0001";
const ANCHOR_MAX_CHARS = 40;
const WHY_MAX_CHARS = 90;
const LEAD_MAX_CHARS = 160;

export interface InsightCandidate {
  /** 提示词里的编号（1 起） */
  no: number;
  kindLabel: string;
  title: string;
  heading: string;
  summary: string;
  claims: string[];
  excerpt: string;
}

export interface InsightPromptInput {
  kindLabel: string;
  title: string;
  /** 所属知识地图主题（「父主题 › 主题」），不在地图上时为空 */
  topic: string;
  /** 已有关系的数量与几个标题（让模型知道哪些已经连着，写「位置」时用） */
  linkedCount: number;
  linkedTitles: string[];
  sections: PromptSection[];
  candidates: InsightCandidate[];
}

export interface PromptSection {
  no: number;
  heading: string;
  blockStart: number;
  blockEnd: number;
  text: string;
}

export const CONTENT_INSIGHTS_SYSTEM_PROMPT = `你是用户个人知识库的阅读助手。给你一篇用户自己写的笔记（分节编号）和从用户其他笔记里找到的候选，找出值得告诉用户的地方。只输出一个 JSON 对象，不要解释或代码块。

标记类型：
- "link"：本文某处说的事，候选里有一篇在讲同一个具体对象、机制或例子，读到这里时翻过去确实有帮助。只是「主题相近」「都属于某一类」不算；说不出具体关联就不要给。anchor 取本文里最能代表这件事的几个字（2–20 字）。
- "dup"：本文某一句和某个候选说的是同一件事（是重复，不只是相关）。anchor 取本文那一句（不超过 40 字）。
- "conflict"：本文的某个说法和某个候选的主张互相冲突，或者一处说「总是」、另一处给了例外。只是侧重点不同不算。anchor 取本文那句话；mine、theirs 各用一句话概括双方的说法。
- "gap"：本文提到了、却没有展开、最值得补写的概念或问题；可以用你自己的知识说明。不需要候选，anchor 留空，text 写「可以展开什么」（不超过 30 字）。最多 ${INSIGHT_MAX_GAPS} 条，只挑最重要的。

规则：
- 宁缺毋滥：只给用户会觉得「这个提醒有用」的，没有就少给，最多 ${INSIGHT_MAX_MARKS} 条。优先给 conflict、dup、link，gap 放最后。
- link、dup、conflict 必须给出候选编号 candidate；anchor 必须逐字摘自 section 指定的那一节原文，不能改写。
- 不要推荐已有连接里的笔记。
- why 用一两句话说清理由（不超过 60 字），说「为什么值得连 / 哪里重复 / 哪里不一致 / 为什么值得展开」。
- lead：两三句话，说这篇在用户知识里的位置（属于什么主题、已经连着几处、和哪些内容相近、哪一块写得少），不超过 120 字，不复述正文。
- asks：0 到 2 个值得继续想的问题，一句话。
- 用笔记本身的语言输出。

输出格式：
{"lead":"…","marks":[{"type":"link","section":1,"anchor":"…","candidate":1,"text":"","why":"…","mine":"","theirs":""}],"asks":["…"]}`;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** 组装用户消息；本文只给到约 6000 字，超出的节不给（模型也就不会在那里标记） */
export function buildInsightsUserPrompt(input: InsightPromptInput): {
  prompt: string;
  sections: PromptSection[];
} {
  let budget = INSIGHT_BODY_MAX_CHARS;
  const used: PromptSection[] = [];
  for (const section of input.sections) {
    if (budget <= 0) break;
    const text = section.text.length > budget ? section.text.slice(0, budget) : section.text;
    budget -= text.length;
    used.push({ ...section, text });
  }
  const body = used
    .map(
      section =>
        `[节 ${section.no}]${section.heading ? ` ${section.heading}` : ""}\n${section.text}`
    )
    .join("\n\n");
  const candidates = input.candidates
    .map(candidate =>
      [
        `[候选 ${candidate.no}] ${candidate.kindLabel}《${candidate.title}》${candidate.heading ? ` › ${candidate.heading}` : ""}`,
        candidate.summary ? `要点：${candidate.summary}` : "",
        candidate.claims.length ? `主张：${candidate.claims.join("；")}` : "",
        `片段：${clip(candidate.excerpt, 300)}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
  const prompt = [
    `笔记类型：${input.kindLabel}`,
    input.title ? `标题：${input.title}` : "",
    input.topic ? `所属主题：${input.topic}` : "",
    `已有连接：${input.linkedCount} 处${input.linkedTitles.length ? `（${input.linkedTitles.map(t => `《${clip(t, 30)}》`).join("、")}）` : ""}`,
    `正文：\n${body}`,
    candidates ? `候选：\n${candidates}` : "候选：无",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, sections: used };
}

/**
 * 顶层块的正文文字，子块之间以换行隔开。默认把行内元素（已有链接、公式等）换成占位符，片段不能落在上面；
 * keepInline 时保留其文字（给模型读）；代码块同理。
 */
export function blockText(block: Descendant, keepInline = false): string {
  const walk = (node: unknown, inline: boolean): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: unknown; code?: unknown; children?: unknown };
    if (typeof n.text === "string")
      return inline && !keepInline ? INLINE_PLACEHOLDER.repeat(n.text.length) : n.text;
    // 代码块的正文不在文字叶子里，连接包不上去：给模型读，但片段不能落在上面
    if (typeof n.code === "string" && !inline)
      return keepInline ? n.code : INLINE_PLACEHOLDER.repeat(n.code.length);
    const children = Array.isArray(n.children) ? n.children : [];
    const hasText = children.some(child => typeof (child as { text?: unknown })?.text === "string");
    return children
      .map(child => {
        const isElement = typeof (child as { text?: unknown })?.text !== "string";
        // 与文字并列的元素是行内元素；只含元素的元素，子元素是块
        if (isElement && hasText) return walk(child, true);
        if (isElement) return `\n${walk(child, inline)}`;
        return walk(child, inline);
      })
      .join("");
  };
  return walk(block, false);
}

/** 片段落在该节的哪个顶层块；找不到返回 -1 */
export function locateAnchor(
  content: Descendant[],
  section: PromptSection,
  anchor: string
): number {
  // 跨子块（列表项之间）的片段包不成一个链接
  if (!anchor || anchor.includes("\n") || anchor.includes(INLINE_PLACEHOLDER)) return -1;
  for (let block = section.blockStart; block <= section.blockEnd; block++) {
    const node = content[block];
    if (node && blockText(node).includes(anchor)) return block;
  }
  return -1;
}

interface RawMark {
  type?: unknown;
  section?: unknown;
  anchor?: unknown;
  candidate?: unknown;
  text?: unknown;
  why?: unknown;
  mine?: unknown;
  theirs?: unknown;
}

export interface ParsedInsights {
  lead: string;
  marks: Array<Omit<InsightMark, "id" | "status" | "target"> & { candidate: number | null }>;
  asks: string[];
}

const KINDS: ReadonlySet<string> = new Set(["link", "dup", "conflict", "gap"]);
const str = (value: unknown, max: number) =>
  typeof value === "string" ? clip(value.replace(/\s+/g, " ").trim(), max) : "";

/**
 * 解析并校验模型输出；JSON 无法解析返回 null。
 * candidateNos：本次给模型的候选编号；同一片段 + 同一候选只留第一条。
 */
export function parseInsightsOutput(
  text: string,
  content: Descendant[],
  sections: PromptSection[],
  candidateNos: ReadonlySet<number>
): ParsedInsights | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: { lead?: unknown; marks?: unknown; asks?: unknown };
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const bySection = new Map(sections.map(section => [section.no, section]));
  const seen = new Set<string>();
  const marks: ParsedInsights["marks"] = [];
  for (const raw of (Array.isArray(value.marks) ? value.marks : []) as RawMark[]) {
    if (marks.length >= INSIGHT_MAX_MARKS) break;
    const kind =
      typeof raw?.type === "string" && KINDS.has(raw.type) ? (raw.type as InsightKind) : null;
    const section = bySection.get(Number(raw?.section));
    if (!kind || !section) continue;
    const why = str(raw.why, WHY_MAX_CHARS);
    if (kind === "gap") {
      const note = str(raw.text, 40) || why;
      if (!note || marks.filter(mark => mark.kind === "gap").length >= INSIGHT_MAX_GAPS) continue;
      marks.push({ kind, block: section.blockEnd, anchor: "", text: note, why, candidate: null });
      continue;
    }
    const anchor = typeof raw.anchor === "string" ? raw.anchor.trim() : "";
    const candidate = Number(raw.candidate);
    if (!anchor || anchor.length > ANCHOR_MAX_CHARS || !candidateNos.has(candidate)) continue;
    const block = locateAnchor(content, section, anchor);
    if (block < 0) continue;
    const key = `${anchor}\u0000${candidate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push({
      kind,
      block,
      anchor,
      text: "",
      why,
      candidate,
      ...(kind === "conflict" || kind === "dup"
        ? { mine: str(raw.mine, WHY_MAX_CHARS), theirs: str(raw.theirs, WHY_MAX_CHARS) }
        : {}),
    });
  }
  const asks = (Array.isArray(value.asks) ? value.asks : [])
    .map(ask => str(ask, 80))
    .filter(Boolean)
    .slice(0, INSIGHT_MAX_ASKS);
  return { lead: str(value.lead, LEAD_MAX_CHARS), marks, asks };
}

/** splitSections 的节 → 提示词里的节（正文文字取块的纯文本，代码节等由调用方先滤掉） */
export function promptSectionsOf(
  content: Descendant[],
  sections: ContentSection[]
): PromptSection[] {
  return sections.map((section, index) => ({
    no: index + 1,
    heading: section.headingPath,
    blockStart: section.blockStart,
    blockEnd: section.blockEnd,
    text: content
      .slice(section.blockStart, section.blockEnd + 1)
      .map(block => blockText(block, true).trim())
      .filter(Boolean)
      .join("\n"),
  }));
}
