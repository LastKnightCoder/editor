/**
 * 驾驶舱卡片的渲染派生（原 features/projects/queries.ts 的 projectExcerpt /
 * projectRelativeTime，拆模块后由三方共用，不落库）。
 */

import type { Descendant } from "slate";
import { clampText, richTextPlainText } from "@tau/shared/rich-text-text";

/** 摘要：富文本 desc 压纯文本，上限 100 字（hero 两行 / 紧凑卡一行共用） */
export function cockpitExcerpt(desc: Descendant[]): string {
  return clampText(richTextPlainText(desc), 100);
}
