import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardElement } from "@/components/WhiteBoard/types/board";

// 内部使用的扩展属性
interface InternalElementProps {
  _needsMeasure?: boolean;
  _rawText?: string;
  _childIds?: string[];
  text?: {
    content?: unknown[];
    align?: "left" | "center" | "right";
  };
  color?: string;
  geometryType?: string;
}

// 带内部属性的元素类型
type InternalBoardElement = BoardElement & InternalElementProps;

interface CacheEntry {
  width: number;
  height: number;
  hash: string;
  timestamp: number;
}

export interface ElementSize {
  width: number;
  height: number;
  hash: string;
}

import { Descendant } from "slate";

export interface MeasurableElement {
  id: string;
  text: string;
  textContent: Descendant[]; // Editor 需要的格式
  color?: string;
  geometryType?: string;
  textAlign?: "left" | "center" | "right";
}

interface ElementsToMeasureItem {
  element: MeasurableElement;
  hash: string;
}

interface UseWhiteBoardMeasurementsOptions {
  hashKey: string;
  cacheNamespace?: string;
}

const MAX_CACHE_ENTRIES = 400;
const SETTLE_DELAY = 1000;

const getStorageKey = (namespace?: string) =>
  `whiteboard-element-size-cache:${namespace || "default"}`;

const loadCache = (storageKey: string): Record<string, CacheEntry> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed || {};
  } catch (error) {
    console.warn("[WhiteBoard] Failed to parse cache", error);
    return {};
  }
};

const persistCache = (
  storageKey: string,
  cache: Record<string, CacheEntry>,
) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(cache));
  } catch (error) {
    console.warn("[WhiteBoard] Failed to persist cache", error);
  }
};

const trimCacheEntries = (entries: Record<string, CacheEntry>) => {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_CACHE_ENTRIES) {
    return entries;
  }
  const sorted = keys
    .map((key) => ({ key, timestamp: entries[key].timestamp }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const trimmed = sorted.slice(sorted.length - MAX_CACHE_ENTRIES);
  return trimmed.reduce<Record<string, CacheEntry>>((acc, item) => {
    acc[item.key] = entries[item.key];
    return acc;
  }, {});
};

const hashString = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
};

const createElementHash = (
  element: MeasurableElement,
  hashKey: string,
): string => {
  const payload = JSON.stringify({
    id: element.id,
    text: element.text,
    geometryType: element.geometryType,
    hashKey,
  });
  return hashString(payload);
};

/**
 * 从 BoardElement 中提取需要测量的元素
 */
export const extractMeasurableElements = (
  elements: BoardElement[],
): MeasurableElement[] => {
  return elements
    .filter((el) => (el as InternalBoardElement)._needsMeasure === true)
    .map((el) => {
      const internalEl = el as InternalBoardElement;
      return {
        id: el.id,
        text: internalEl._rawText || "",
        textContent: (internalEl.text?.content || []) as Descendant[],
        color: internalEl.color,
        geometryType: internalEl.geometryType,
        textAlign: internalEl.text?.align || "center",
      };
    });
};

export const useWhiteBoardMeasurements = (
  elements: MeasurableElement[],
  options: UseWhiteBoardMeasurementsOptions,
) => {
  const { hashKey, cacheNamespace } = options;
  const storageKey = getStorageKey(cacheNamespace);

  const [cacheEntries, setCacheEntries] = useState<Record<string, CacheEntry>>(
    () => loadCache(storageKey),
  );
  const [verifyingElements, setVerifyingElements] = useState<
    Record<string, true>
  >({});
  const verifyingTimers = useRef<Record<string, number>>({});
  const previousHashesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    setCacheEntries(loadCache(storageKey));
  }, [storageKey]);

  useEffect(() => {
    persistCache(storageKey, cacheEntries);
  }, [cacheEntries, storageKey]);

  const elementHashes = useMemo(() => {
    return elements.reduce<Record<string, string>>((acc, item) => {
      acc[item.id] = createElementHash(item, hashKey);
      return acc;
    }, {});
  }, [elements, hashKey]);

  const [sizes, setSizes] = useState<Record<string, ElementSize>>({});

  const scheduleVerification = useCallback((id: string) => {
    setVerifyingElements((prev) => {
      if (prev[id]) return prev;
      return {
        ...prev,
        [id]: true,
      };
    });

    if (verifyingTimers.current[id]) {
      clearTimeout(verifyingTimers.current[id]);
    }

    verifyingTimers.current[id] = window.setTimeout(() => {
      setVerifyingElements((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete verifyingTimers.current[id];
    }, SETTLE_DELAY);
  }, []);

  useEffect(() => {
    setVerifyingElements((prev) => {
      const next: Record<string, true> = {};
      Object.keys(prev).forEach((id) => {
        if (elementHashes[id]) {
          next[id] = true;
        }
      });
      return next;
    });

    Object.entries(elementHashes).forEach(([id, hash]) => {
      if (previousHashesRef.current[id] !== hash) {
        scheduleVerification(id);
      }
    });

    previousHashesRef.current = elementHashes;
  }, [elementHashes, scheduleVerification]);

  useEffect(() => {
    return () => {
      Object.values(verifyingTimers.current).forEach((timer) => {
        clearTimeout(timer);
      });
      verifyingTimers.current = {};
    };
  }, []);

  useEffect(() => {
    setSizes((prev) => {
      const next: Record<string, ElementSize> = {};
      let changed = false;

      elements.forEach((item) => {
        const id = item.id;
        const hash = elementHashes[id];
        const prevItem = prev[id];

        if (prevItem && prevItem.hash === hash) {
          next[id] = prevItem;
          return;
        }

        const cached = cacheEntries[id];
        if (cached && cached.hash === hash) {
          next[id] = {
            width: cached.width,
            height: cached.height,
            hash,
          };
          changed = true;
        } else if (prevItem) {
          changed = true;
        }
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [elements, elementHashes, cacheEntries]);

  const elementsToMeasure = useMemo<ElementsToMeasureItem[]>(() => {
    return elements
      .map((item) => {
        const hash = elementHashes[item.id];
        const size = sizes[item.id];
        if (!hash) return null;
        if (!size || size.hash !== hash || verifyingElements[item.id]) {
          return { element: item, hash };
        }
        return null;
      })
      .filter((item): item is ElementsToMeasureItem => Boolean(item));
  }, [elements, elementHashes, sizes, verifyingElements]);

  const reportSize = useCallback(
    (id: string, size: { width: number; height: number }, hash: string) => {
      setSizes((prev) => {
        const prevItem = prev[id];
        if (
          prevItem &&
          prevItem.width === size.width &&
          prevItem.height === size.height &&
          prevItem.hash === hash
        ) {
          return prev;
        }
        return {
          ...prev,
          [id]: {
            width: size.width,
            height: size.height,
            hash,
          },
        };
      });

      setCacheEntries((prev) => {
        const updated = {
          ...prev,
          [id]: {
            width: size.width,
            height: size.height,
            hash,
            timestamp: Date.now(),
          },
        };
        return trimCacheEntries(updated);
      });
      scheduleVerification(id);
    },
    [scheduleVerification],
  );

  return {
    elementSizes: sizes,
    elementsToMeasure,
    reportSize,
  };
};
