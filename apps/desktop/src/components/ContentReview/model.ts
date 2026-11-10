/**
 * 对话卡片的审阅状态与文案从主进程建议记录派生。
 */

import type { ContentSuggestion } from "@/types/content-suggestion";
import { MAIN_AGENT_NAME } from "@/services/agent-identity";

/** 待用户处理：待接受的改动、待回答的提问、过期待决定（重写 / 忽略）的改动 */
export const needsReview = (item: ContentSuggestion) =>
  item.status === "pending" || item.status === "expired";

/** 正在提交（还没有结果）或结果未确认 */
export const isApplying = (item: ContentSuggestion) => item.status === "applying";

export const agentNameOf = (item: Pick<ContentSuggestion, "agentLabel">) =>
  item.agentLabel || MAIN_AGENT_NAME;

export const clipText = (text: string, limit = 80) => {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

const isWordChar = (char: string | undefined) => Boolean(char && /[A-Za-z0-9_]/.test(char));

/** 改动拆成「共同前缀 / 删掉的 / 新写的 / 共同后缀」；英文按整词切，不把一个单词劈成两半 */
export function splitTextChange(before: string, after: string) {
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before[start] === after[start]) start++;
  while (
    start > 0 &&
    isWordChar(before[start - 1]) &&
    (isWordChar(before[start]) || isWordChar(after[start]))
  )
    start--;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end])
    end++;
  while (
    end > 0 &&
    isWordChar(before[before.length - end]) &&
    (isWordChar(before[before.length - 1 - end]) || isWordChar(after[after.length - 1 - end]))
  )
    end--;
  return {
    prefix: before.slice(0, start),
    removed: before.slice(start, before.length - end),
    added: after.slice(start, after.length - end),
    suffix: before.slice(before.length - end),
  };
}

/** 前后文只留贴近改动的一截 */
export const clipHead = (text: string, limit: number) =>
  text.length > limit ? `…${text.slice(-limit)}` : text;
export const clipTail = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;
