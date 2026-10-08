/**
 * 驾驶舱卡片的渲染派生（原 features/projects/queries.ts 的 projectExcerpt /
 * projectRelativeTime，拆模块后由三方共用，不落库）。
 */

import type { Descendant } from "slate";
import { clampText, richTextPlainText } from "@tau/shared/rich-text-text";

const DAY_MS = 86_400_000;

/** 摘要：富文本 desc 压纯文本，上限 100 字（hero 两行 / 紧凑卡一行共用） */
export function cockpitExcerpt(desc: Descendant[]): string {
  return clampText(richTextPlainText(desc), 100);
}

/** 相对更新时间（自然日语义，与 articles 域同构） */
export function cockpitRelativeTime(ts: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
