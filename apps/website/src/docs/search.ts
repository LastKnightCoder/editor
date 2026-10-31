import Fuse, { type FuseResult } from "fuse.js";
import { DOC_SEARCH_KEYS, type DocSearchDocument, type DocSearchPayload } from "./searchIndex.ts";

export type DocSearchHit = FuseResult<DocSearchDocument>;
export type DocSearchEngine = (query: string) => DocSearchHit[];

export function createDocSearch(payload: DocSearchPayload): DocSearchEngine {
  const fuse = new Fuse(
    payload.documents,
    {
      keys: DOC_SEARCH_KEYS,
      includeMatches: true,
      threshold: 0.3,
      ignoreLocation: true,
      ignoreFieldNorm: true,
    },
    Fuse.parseIndex<DocSearchDocument>(payload.index)
  );
  return query => {
    const normalized = query.replace(/\s+/g, " ").trim();
    return normalized ? fuse.search(normalized, { limit: 12 }) : [];
  };
}

const engines = new Map<string, Promise<DocSearchEngine>>();

export function loadDocSearch(url: string, basePath: string): Promise<DocSearchEngine> {
  let pending = engines.get(url);
  if (!pending) {
    pending = fetch(url).then(async response => {
      if (!response.ok) throw new Error(`搜索索引加载失败：HTTP ${response.status}`);
      const payload: DocSearchPayload = await response.json();
      if (
        payload.version !== 1 ||
        payload.basePath !== basePath ||
        !Array.isArray(payload.documents)
      )
        throw new Error("搜索索引与当前文档不匹配，请刷新页面重试");
      return createDocSearch(payload);
    });
    engines.set(url, pending);
    pending.catch(() => engines.delete(url));
  }
  return pending;
}

export interface SearchTextPart {
  text: string;
  match: boolean;
}

/** Fuse 的闭区间转换为纯文本片段，摘要围绕首次命中截取。 */
export function searchTextParts(
  text: string,
  ranges: ReadonlyArray<readonly [number, number]> = [],
  maxLength = text.length
): SearchTextPart[] {
  const start = Math.min(
    Math.max(0, text.length - maxLength),
    Math.max(0, (ranges[0]?.[0] ?? 0) - Math.floor(maxLength / 3))
  );
  const end = Math.min(text.length, start + maxLength);
  const parts: SearchTextPart[] = start ? [{ text: "…", match: false }] : [];
  let cursor = start;
  for (const [from, through] of ranges) {
    const left = Math.max(cursor, from);
    const right = Math.min(end, through + 1);
    if (left >= right) continue;
    if (cursor < left) parts.push({ text: text.slice(cursor, left), match: false });
    parts.push({ text: text.slice(left, right), match: true });
    cursor = right;
  }
  if (cursor < end) parts.push({ text: text.slice(cursor, end), match: false });
  if (end < text.length) parts.push({ text: "…", match: false });
  return parts;
}
