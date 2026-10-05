/**
 * 浏览器插件 → 摘录：校验插件按页发来的划线快照（excerpt.syncPage，KL-035）。纯函数，主进程写库前调用。
 *
 * RPC 端口没有鉴权，参数一律当不可信输入：只收 http(s) URL，条数与长度有上限，超出整页拒绝。
 */

import type { ExcerptInput } from "./types";

export const WEB_PAGE_LIMITS = {
  highlights: 5000,
  quoteChars: 20000,
  noteChars: 20000,
  titleChars: 500,
  urlChars: 4000,
} as const;

/** 与插件存储 key 一致：只去掉 #hash，查询参数与大小写原样保留 */
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

export interface WebPageExcerpts {
  url: string;
  title: string;
  inputs: ExcerptInput[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string") throw new Error(`划线字段 ${field} 必须是字符串`);
  if (value.length > max) throw new Error(`划线字段 ${field} 超过 ${max} 字`);
  return value;
};

const int = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`划线字段 ${field} 必须是数字`);
  return Math.trunc(value);
};

export function parseWebPagePayload(raw: unknown): WebPageExcerpts {
  if (!isRecord(raw)) throw new Error("参数必须是对象");
  const url = normalizeWebPageUrl(raw.url as string);
  if (!url) throw new Error("url 必须是 http(s) 地址");
  const title = typeof raw.title === "string" ? raw.title.slice(0, WEB_PAGE_LIMITS.titleChars) : "";
  if (!Array.isArray(raw.highlights)) throw new Error("highlights 必须是数组");
  if (raw.highlights.length > WEB_PAGE_LIMITS.highlights) {
    throw new Error(`单页划线超过 ${WEB_PAGE_LIMITS.highlights} 条`);
  }

  const inputs: ExcerptInput[] = [];
  for (const item of raw.highlights) {
    if (!isRecord(item)) throw new Error("划线必须是对象");
    const id = str(item.id, "id", 100);
    if (!id) throw new Error("划线 id 不能为空");
    const quote = str(item.text, "text", WEB_PAGE_LIMITS.quoteChars).trim();
    if (!quote) continue;
    const anchor = isRecord(item.anchor) ? item.anchor : null;
    inputs.push({
      externalId: id,
      quote,
      note: item.note == null ? "" : str(item.note, "note", WEB_PAGE_LIMITS.noteChars).trim(),
      anchor: anchor
        ? {
            startXPath: str(anchor.startXPath, "startXPath", 2000),
            startOffset: int(anchor.startOffset, "startOffset"),
            endXPath: str(anchor.endXPath, "endXPath", 2000),
            endOffset: int(anchor.endOffset, "endOffset"),
          }
        : null,
      color: item.color == null ? null : str(item.color, "color", 50),
      sourceTime: item.createdAt == null ? null : int(item.createdAt, "createdAt"),
    });
  }
  return { url, title, inputs };
}
