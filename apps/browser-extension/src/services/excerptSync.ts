/**
 * 划线同步进桌面摘录（KL-035）：按页快照发送 excerpt.syncPage，由桌面按页 diff（删除自然传过去，
 * 插件不需要墓碑）。按库记已同步的快照哈希，只发变化的页；失败的页保持脏，下次触发再发。
 *
 * 划线进入桌面当前打开的库；切到另一个库后，该库没有同步记录，全部划线会再同步一遍。
 */

import { STORAGE_KEY_PREFIX, type PageHighlights } from "@/content/types";

export const EXCERPT_SYNC_STATE_PREFIX = "tau-excerpt-sync:";

export interface ExcerptPagePayload {
  url: string;
  title: string;
  highlights: Array<{
    id: string;
    text: string;
    note: string;
    color: string;
    createdAt: number;
    anchor: { startXPath: string; startOffset: number; endXPath: string; endOffset: number };
  }>;
}

export interface ExcerptSyncDeps {
  request(method: string, params: unknown): Promise<unknown>;
  storageGetAll(): Promise<Record<string, unknown>>;
  storageSet(items: Record<string, unknown>): Promise<void>;
}

export function pagePayload(page: PageHighlights): ExcerptPagePayload {
  return {
    url: page.url.split("#")[0],
    title: page.title ?? "",
    highlights: page.highlights.map(highlight => ({
      id: highlight.id,
      text: highlight.range.text,
      note: page.annotations[highlight.id]?.text ?? "",
      color: highlight.color,
      createdAt: highlight.createdAt,
      anchor: {
        startXPath: highlight.range.startXPath,
        startOffset: highlight.range.startOffset,
        endXPath: highlight.range.endXPath,
        endOffset: highlight.range.endOffset,
      },
    })),
  };
}

/** 快照的稳定哈希（FNV-1a 32 位），只用于判断是否变化 */
export function payloadHash(payload: ExcerptPagePayload): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

const isPage = (value: unknown): value is PageHighlights =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PageHighlights).url === "string" &&
  Array.isArray((value as PageHighlights).highlights);

export async function syncHighlightsToDesktop(
  deps: ExcerptSyncDeps
): Promise<{ sent: number; failed: number }> {
  const { dbName } = (await deps.request("settings.getCurrentDatabase", {})) as {
    dbName?: string;
  };
  if (!dbName) return { sent: 0, failed: 0 };
  const stateKey = `${EXCERPT_SYNC_STATE_PREFIX}${dbName}`;
  const all = await deps.storageGetAll();
  const state = { ...((all[stateKey] as Record<string, string> | undefined) ?? {}) };

  const pages = new Map<string, ExcerptPagePayload>();
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STORAGE_KEY_PREFIX) || !isPage(value)) continue;
    const payload = pagePayload(value);
    pages.set(payload.url, payload);
  }
  // 存储里整页消失（如清理了插件数据）：发空快照让桌面软删除该页摘录
  for (const url of Object.keys(state)) {
    if (!pages.has(url)) pages.set(url, { url, title: "", highlights: [] });
  }

  let sent = 0;
  let failed = 0;
  for (const [url, payload] of pages) {
    const hash = payloadHash(payload);
    if (state[url] === hash) continue;
    try {
      await deps.request("excerpt.syncPage", payload);
      if (payload.highlights.length === 0 && !all[`${STORAGE_KEY_PREFIX}${url}`]) delete state[url];
      else state[url] = hash;
      sent += 1;
      await deps.storageSet({ [stateKey]: state });
    } catch (error) {
      failed += 1;
      console.warn("[Tau Extension] 划线同步失败，稍后重试", url, error);
    }
  }
  return { sent, failed };
}
