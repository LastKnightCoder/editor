/**
 * 笔记元信息的提示词与输出解析（纯函数）：一次调用生成标题、要点、概念、主张四个字段。
 *
 * 输入只给纯文本：Markdown 里的图片地址、链接等对概括没有帮助，只增加 token。
 * 长文给「标题 + 大纲 + 正文前约 6000 字」；长文的标题由用户写，不用 AI 的，只取要点与概念。
 */

import type { Descendant } from "slate";
import { contentPlainText } from "@/entity/text-digest";
import type { ContentAiMeta } from "./tables/content-ai-meta";

/** 正文输入截断长度（字符） */
export const INPUT_MAX_CHARS = 6000;
const OUTLINE_MAX_LINES = 60;
export const TITLE_MAX_CHARS = 24;
const SUMMARY_MAX_CHARS = 60;

export type ContentAiKind = "card" | "article" | "project-item";

export interface ContentAiInput {
  kind: ContentAiKind;
  /** 文章、项目文档的标题；卡片为空 */
  title: string;
  content: Descendant[];
}

export const CONTENT_AI_SYSTEM_PROMPT = `你是用户个人知识库的整理助手，为一份笔记生成元信息，只输出一个 JSON 对象，不要任何解释或 Markdown 代码块。

字段：
- "title"：概括这份笔记的核心观点，不是复述开头；不加引号、句号；不超过 ${TITLE_MAX_CHARS} 个字。
- "summary"：一句话说清要点，不超过 ${SUMMARY_MAX_CHARS} 个字。
- "concepts"：3 到 8 个关键概念（名词或短语）。
- "claims"：笔记里明确提出的主要主张，0 到 3 条，每条一句；没有明确主张就给空数组。

用笔记本身的语言输出（中文笔记用中文）。只依据笔记内容，不补充笔记里没有的观点。`;

/** 大纲：各级标题按层级缩进 */
function outlineOf(content: Descendant[]): string[] {
  const lines: string[] = [];
  for (const node of content) {
    const block = node as { type?: string; level?: number };
    if (block.type !== "header") continue;
    const text = contentPlainText([node]).replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push(`${"  ".repeat(Math.max(0, Number(block.level ?? 1) - 1))}- ${text}`);
    if (lines.length >= OUTLINE_MAX_LINES) break;
  }
  return lines;
}

/** 组装用户消息；正文为空时返回 null（没有可概括的内容） */
export function buildContentAiUserPrompt(input: ContentAiInput): string | null {
  const text = contentPlainText(input.content);
  if (!text.trim()) return null;
  const truncated = text.length > INPUT_MAX_CHARS;
  const body = truncated ? text.slice(0, INPUT_MAX_CHARS) : text;
  if (input.kind === "card") return `笔记类型：卡片\n\n正文：\n${body}`;
  const outline = outlineOf(input.content);
  return [
    `笔记类型：${input.kind === "article" ? "文章" : "项目文档"}`,
    `标题：${input.title || "（无）"}`,
    outline.length ? `大纲：\n${outline.join("\n")}` : "",
    `正文${truncated ? `（前 ${INPUT_MAX_CHARS} 字）` : ""}：\n${body}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const cleanTitle = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[「『“"'《【]+|[」』”"'》】]+$/g, "")
    .replace(/[。.！!？?；;，,]+$/u, "")
    .trim();

const stringList = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map(item => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

/** 解析模型输出：容忍代码块包裹与前后多余文字；标题缺失视为失败 */
export function parseContentAiOutput(text: string): ContentAiMeta | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const title = typeof value.title === "string" ? cleanTitle(value.title) : "";
  if (!title) return null;
  return {
    title,
    summary: typeof value.summary === "string" ? value.summary.replace(/\s+/g, " ").trim() : "",
    concepts: stringList(value.concepts, 8),
    claims: stringList(value.claims, 3),
  };
}
