/**
 * 摘录的展示文字：脉络、搜索、对话引用与索引共用。只用提供方名称、来源标题、位置与外链，不读提供方私有定位。
 */

import type { Excerpt } from "./types";

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

/** 来源名：标题，缺省时用外链或来源键的域名 */
export const excerptSourceName = (excerpt: Pick<Excerpt, "sourceTitle" | "sourceKey" | "url">) =>
  excerpt.sourceTitle.trim() ||
  hostOf(excerpt.url ?? "") ||
  hostOf(excerpt.sourceKey) ||
  "未知来源";

/** 「提供方 · 来源 · 位置」 */
export const excerptMeta = (excerpt: Excerpt, label: string) =>
  [label, excerptSourceName(excerpt), excerpt.location.trim()].filter(Boolean).join(" · ");

/** 索引文本的标题行：「来源 › 位置」 */
export const excerptIndexHeader = (excerpt: Excerpt) =>
  [excerptSourceName(excerpt), excerpt.location.trim()].filter(Boolean).join(" › ");
