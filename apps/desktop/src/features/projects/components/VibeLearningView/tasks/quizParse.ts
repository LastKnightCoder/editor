/** 测验生成输出的解析：完整解析（落库用）+ 流式增量解析（执行过程页逐题显示） */

import type { Descendant } from "slate";
import type { GeneratedQuizItem } from "@/types/vl-quiz";
import { textToDescendants, parseTextWithBlanks } from "@/utils/flashcard";

interface RawQuizItem {
  type?: string;
  prompt?: string | Descendant[];
  detail?: string | Descendant[];
  difficulty?: string;
  tags?: string[];
  data?: Record<string, unknown>;
}

const generateId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function toItem(item: RawQuizItem): GeneratedQuizItem {
  // 填空题的 {{blank:xx}} 标记要解析成 flashcard-blank 元素
  const prompt =
    typeof item.prompt === "string"
      ? item.type === "cloze"
        ? parseTextWithBlanks(item.prompt)
        : textToDescendants(item.prompt)
      : item.prompt || textToDescendants("");
  return {
    id: generateId(),
    type: (item.type || "qa") as GeneratedQuizItem["type"],
    prompt,
    detail:
      typeof item.detail === "string"
        ? textToDescendants(item.detail || "")
        : item.detail || textToDescendants(""),
    difficulty: (item.difficulty || "standard") as GeneratedQuizItem["difficulty"],
    tags: item.tags || [],
    data: (item.data || {}) as GeneratedQuizItem["data"],
    selected: true,
  };
}

/** 完整解析：去掉代码块围栏，取第一个 [ 到最后一个 ] */
export function parseQuizResponse(text: string): GeneratedQuizItem[] {
  let cleaned = text
    .trim()
    .replace(/^```(?:json)?/, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("输出不是题目数组");
  return parsed.map(toItem);
}

/**
 * 增量解析：扫描数组里已经闭合的顶层对象（跳过字符串内的括号），
 * 返回已完成题目的题干纯文本。输出未完成时也能逐题显示。
 */
export function parsePartialQuizPrompts(text: string): string[] {
  const start = text.indexOf("[");
  if (start === -1) return [];
  const prompts: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const item = JSON.parse(text.slice(objStart, i + 1)) as RawQuizItem;
          const prompt = typeof item.prompt === "string" ? item.prompt : "";
          prompts.push(prompt.replace(/\{\{blank:([^}]*)\}\}/g, "____"));
        } catch {
          // 不完整或非法对象：跳过
        }
        objStart = -1;
      }
    }
  }
  return prompts;
}
