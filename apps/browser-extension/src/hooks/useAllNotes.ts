import { useState, useEffect, useCallback } from "react";
import type { NoteMetadata } from "../utils/types";

const STORAGE_PREFIX_META = "tau-notes-meta:";

/** 按 URL 分组的笔记数据 */
export interface UrlNotesGroup {
  url: string;
  notes: NoteMetadata[];
  /** 该 URL 下最近一次更新的时间戳 */
  latestUpdatedAt: number;
}

interface UseAllNotesReturn {
  groups: UrlNotesGroup[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * 获取所有 URL 下的笔记，按最近更新时间降序排列
 */
export function useAllNotes(): UseAllNotesReturn {
  const [groups, setGroups] = useState<UrlNotesGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const allData = await chrome.storage.local.get(null);
      const result: UrlNotesGroup[] = [];

      for (const key of Object.keys(allData)) {
        if (!key.startsWith(STORAGE_PREFIX_META)) continue;

        const url = key.slice(STORAGE_PREFIX_META.length);
        const notes = allData[key] as NoteMetadata[] | undefined;

        if (!notes || notes.length === 0) continue;

        const latestUpdatedAt = Math.max(...notes.map((n) => n.updatedAt));
        result.push({ url, notes, latestUpdatedAt });
      }

      // 按最近更新时间降序
      result.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
      setGroups(result);
    } catch (error) {
      console.error("Failed to load all notes:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return { groups, isLoading, refresh: loadAll };
}
