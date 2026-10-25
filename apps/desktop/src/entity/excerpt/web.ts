/**
 * 浏览器伴读 → 摘录：校验扩展按页发来的标注快照（annotations.sync）。纯函数，主进程写库前调用。
 *
 * 扩展虽经配对授权，参数仍当不可信输入：只收 http(s) URL，条数与长度有上限，超出整页拒绝。
 */

import { HIGHLIGHT_COLORS, WEB_HIGHLIGHT_HASH } from "@tau/shared/browser-companion";
import type { ExcerptAnchor, ExcerptInput } from "./types";

export const WEB_PAGE_LIMITS = {
  highlights: 5000,
  quoteChars: 20000,
  noteChars: 20000,
  titleChars: 500,
  urlChars: 4000,
} as const;

/** 页面键：只去掉 #hash，查询参数与大小写原样保留（扩展侧同一规则） */
export function normalizeWebPageUrl(url: string): string | null {
  if (typeof url !== "string" || url.length > WEB_PAGE_LIMITS.urlChars) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return url.split("#")[0];
}

/** 网页摘录打开时带上标注 id，伴读扩展据此滚到那条标注 */
export const webExcerptUrl = (pageUrl: string, externalId: string) =>
  `${pageUrl}#${WEB_HIGHLIGHT_HASH}=${encodeURIComponent(externalId)}`;

export interface WebPageExcerpts {
  url: string;
  title: string;
  inputs: ExcerptInput[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string") throw new Error(`标注字段 ${field} 必须是字符串`);
  if (value.length > max) throw new Error(`标注字段 ${field} 超过 ${max} 字`);
  return value;
};

const int = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`标注字段 ${field} 必须是数字`);
  return Math.trunc(value);
};

const CONTEXT_CHARS = 200;

/** 锚点：TextQuote（原文 + 前后文）+ TextPosition（正文字符偏移） */
function parseAnchor(raw: unknown): ExcerptAnchor | null {
  if (!isRecord(raw) || !isRecord(raw.quote) || !isRecord(raw.position)) return null;
  return {
    quote: {
      exact: str(raw.quote.exact, "quote.exact", WEB_PAGE_LIMITS.quoteChars),
      prefix: str(raw.quote.prefix, "quote.prefix", CONTEXT_CHARS),
      suffix: str(raw.quote.suffix, "quote.suffix", CONTEXT_CHARS),
    },
    position: {
      start: int(raw.position.start, "position.start"),
      end: int(raw.position.end, "position.end"),
    },
  };
}

/** 浏览器伴读按页发来的标注快照 → 摘录输入；颜色只收编辑器行内色板的色相 id */
export function parseWebPagePayload(raw: unknown): WebPageExcerpts {
  if (!isRecord(raw)) throw new Error("参数必须是对象");
  const url = normalizeWebPageUrl(raw.url as string);
  if (!url) throw new Error("url 必须是 http(s) 地址");
  const title = typeof raw.title === "string" ? raw.title.slice(0, WEB_PAGE_LIMITS.titleChars) : "";
  if (!Array.isArray(raw.items)) throw new Error("items 必须是数组");
  if (raw.items.length > WEB_PAGE_LIMITS.highlights) {
    throw new Error(`单页标注超过 ${WEB_PAGE_LIMITS.highlights} 条`);
  }

  const inputs: ExcerptInput[] = [];
  for (const item of raw.items) {
    if (!isRecord(item)) throw new Error("标注必须是对象");
    const id = str(item.id, "id", 100);
    if (!id) throw new Error("标注 id 不能为空");
    const quote = str(item.text, "text", WEB_PAGE_LIMITS.quoteChars).trim();
    if (!quote) continue;
    if (!(HIGHLIGHT_COLORS as readonly unknown[]).includes(item.color)) {
      throw new Error("标注颜色无效");
    }
    inputs.push({
      externalId: id,
      quote,
      note: item.note == null ? "" : str(item.note, "note", WEB_PAGE_LIMITS.noteChars).trim(),
      location: "",
      url: webExcerptUrl(url, id),
      anchor: parseAnchor(item.anchor),
      color: item.color as string,
      sourceTime: item.createdAt == null ? null : int(item.createdAt, "createdAt"),
    });
  }
  return { url, title, inputs };
}
