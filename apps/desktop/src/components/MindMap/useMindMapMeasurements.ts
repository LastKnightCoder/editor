import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlattenedMindMapNode } from "./types";

interface CacheEntry {
  width: number;
  height: number;
  hash: string;
  timestamp: number;
}

export interface NodeSize {
  width: number;
  height: number;
  hash: string;
}

interface NodesToMeasureItem {
  node: FlattenedMindMapNode;
  hash: string;
}

interface UseMindMapMeasurementsOptions {
  hashKey: string;
  cacheNamespace?: string;
}

const MAX_CACHE_ENTRIES = 400;
const SETTLE_DELAY = 1000;

const getStorageKey = (namespace?: string) =>
  `mindmap-node-size-cache:${namespace || "default"}`;

const loadCache = (storageKey: string) => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed || {};
  } catch (error) {
    console.warn("[MindMap] Failed to parse cache", error);
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
    console.warn("[MindMap] Failed to persist cache", error);
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

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
};

const createNodeHash = (
  node: FlattenedMindMapNode,
  hashKey: string,
): string => {
  const payload = JSON.stringify({
    id: node.node.id,
    text: node.node.text ?? [],
    level: node.level,
    measureSingleLine: node.node.meta?.measureSingleLine,
    measureInlinePrefixWidth: node.node.meta?.measureInlinePrefixWidth,
    hashKey,
  });
  return hashString(payload);
};

export const useMindMapMeasurements = (
  nodes: FlattenedMindMapNode[],
  options: UseMindMapMeasurementsOptions,
) => {
  const { hashKey, cacheNamespace } = options;
  const storageKey = getStorageKey(cacheNamespace);

  const [cacheEntries, setCacheEntries] = useState<Record<string, CacheEntry>>(
    () => loadCache(storageKey),
  );
  const [verifyingNodes, setVerifyingNodes] = useState<Record<string, true>>(
    {},
  );
  const verifyingTimers = useRef<Record<string, number>>({});
  const previousHashesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    setCacheEntries(loadCache(storageKey));
  }, [storageKey]);

  useEffect(() => {
    persistCache(storageKey, cacheEntries);
  }, [cacheEntries, storageKey]);

  const nodeHashes = useMemo(() => {
    return nodes.reduce<Record<string, string>>((acc, item) => {
      acc[item.node.id] = createNodeHash(item, hashKey);
      return acc;
    }, {});
  }, [nodes, hashKey]);

  const [sizes, setSizes] = useState<Record<string, NodeSize>>({});

  const scheduleVerification = useCallback((id: string) => {
    setVerifyingNodes((prev) => {
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
      setVerifyingNodes((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete verifyingTimers.current[id];
    }, SETTLE_DELAY);
  }, []);

  useEffect(() => {
    setVerifyingNodes((prev) => {
      const next: Record<string, true> = {};
      Object.keys(prev).forEach((id) => {
        if (nodeHashes[id]) {
          next[id] = true;
        }
      });
      return next;
    });

    Object.entries(nodeHashes).forEach(([id, hash]) => {
      if (previousHashesRef.current[id] !== hash) {
        scheduleVerification(id);
      }
    });

    previousHashesRef.current = nodeHashes;
  }, [nodeHashes, scheduleVerification]);

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
      const next: Record<string, NodeSize> = {};
      let changed = false;

      nodes.forEach((item) => {
        const id = item.node.id;
        const hash = nodeHashes[id];
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
  }, [nodes, nodeHashes, cacheEntries]);

  const nodesToMeasure = useMemo<NodesToMeasureItem[]>(() => {
    return nodes
      .map((item) => {
        const hash = nodeHashes[item.node.id];
        const size = sizes[item.node.id];
        if (!hash) return null;
        if (!size || size.hash !== hash || verifyingNodes[item.node.id]) {
          return { node: item, hash };
        }
        return null;
      })
      .filter((item): item is NodesToMeasureItem => Boolean(item));
  }, [nodes, nodeHashes, sizes, verifyingNodes]);

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
    nodeSizes: sizes,
    nodesToMeasure,
    reportSize,
  };
};
