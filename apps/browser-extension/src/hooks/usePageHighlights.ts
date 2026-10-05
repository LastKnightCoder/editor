import { useState, useEffect, useCallback, useRef } from "react";
import type { PageHighlights, HighlightStyle, HighlightColor, Annotation } from "../content/types";
import { STORAGE_KEY_PREFIX } from "../content/types";
import { getPageHighlights, savePageHighlightsImmediate } from "../content/storage";

/**
 * 当前页面的高亮与想法：读 chrome.storage，跟随页面端（content script）的编辑实时刷新，
 * 侧栏的改动立即落盘（页面端经同一 storage 事件同步）。
 */
export function usePageHighlights(url: string | null) {
  const [pageData, setPageData] = useState<PageHighlights | null>(null);
  const pageDataRef = useRef<PageHighlights | null>(null);

  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  useEffect(() => {
    if (!url) {
      setPageData(null);
      return;
    }
    let alive = true;
    getPageHighlights(url).then(data => {
      if (alive) setPageData(data);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const key = `${STORAGE_KEY_PREFIX}${url.split("#")[0]}`;
    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!changes[key]) return;
      const next = (changes[key].newValue as PageHighlights | undefined) ?? null;
      const current = pageDataRef.current;
      const isSelfTriggered =
        current &&
        next &&
        JSON.stringify(current.highlights) === JSON.stringify(next.highlights) &&
        JSON.stringify(current.annotations) === JSON.stringify(next.annotations);
      if (!isSelfTriggered) setPageData(next);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [url]);

  const update = useCallback(
    async (updater: (prev: PageHighlights) => PageHighlights) => {
      if (!url) return;
      const base: PageHighlights = pageDataRef.current ?? {
        url: url.split("#")[0]!,
        highlights: [],
        annotations: {},
        version: 1,
      };
      const next = updater(base);
      setPageData(next);
      await savePageHighlightsImmediate(next);
    },
    [url]
  );

  const setStyle = useCallback(
    (highlightId: string, style: HighlightStyle) =>
      update(prev => ({
        ...prev,
        highlights: prev.highlights.map(h => (h.id === highlightId ? { ...h, style } : h)),
      })),
    [update]
  );

  const setColor = useCallback(
    (highlightId: string, color: HighlightColor) =>
      update(prev => ({
        ...prev,
        highlights: prev.highlights.map(h => (h.id === highlightId ? { ...h, color } : h)),
      })),
    [update]
  );

  const remove = useCallback(
    (highlightId: string) =>
      update(prev => {
        const { [highlightId]: _removed, ...annotations } = prev.annotations;
        return {
          ...prev,
          highlights: prev.highlights.filter(h => h.id !== highlightId),
          annotations,
        };
      }),
    [update]
  );

  /** 写想法；空文本即删除想法 */
  const saveAnnotation = useCallback(
    (highlightId: string, text: string) =>
      update(prev => {
        const trimmed = text.trim();
        if (!trimmed) {
          const { [highlightId]: _removed, ...rest } = prev.annotations;
          return { ...prev, annotations: rest };
        }
        const existing = prev.annotations[highlightId];
        const now = Date.now();
        const annotation: Annotation = existing
          ? { ...existing, text: trimmed, updatedAt: now }
          : { highlightId, text: trimmed, isPublic: false, createdAt: now, updatedAt: now };
        return { ...prev, annotations: { ...prev.annotations, [highlightId]: annotation } };
      }),
    [update]
  );

  return {
    highlights: pageData?.highlights ?? [],
    annotations: pageData?.annotations ?? {},
    setStyle,
    setColor,
    remove,
    saveAnnotation,
  };
}

/** 让页面滚到对应高亮（content script 处理） */
export async function scrollToHighlight(highlightId: string) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: "TAU_SCROLL_TO_HIGHLIGHT", highlightId });
    }
  } catch (error) {
    console.error("滚动到高亮失败:", error);
  }
}

/** 相对时间：刚刚 / 3 分钟前 / 2 小时前 / 昨天 / 3 天前 / 2 周前 / 1月12日 */
export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return "昨天";
  if (d < 7) return `${d} 天前`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} 周前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
