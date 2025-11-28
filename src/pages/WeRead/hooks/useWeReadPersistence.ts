import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import type { RowData } from "@/components/Database/types";
import type { Metadata, Notebook } from "@/types/weread";
import {
  getAllWeReadNotebooks,
  getWeReadLastSyncTime,
  saveWeReadNotebooks,
  updateWeReadSyncTime,
} from "@/commands/weread";
import { useWeReadData } from "./useWeReadData";
import { convertNotebookToSlate } from "./useWeReadContent";
import weReadService, { MetadataListResult } from "@/services/weread";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

interface UseWeReadPersistenceOptions {
  isConnected: boolean;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const mergeNotebookLists = (
  base: Notebook[],
  updates: Notebook[],
  replace: boolean,
): Notebook[] => {
  const map = new Map<string, Notebook>();
  if (!replace) {
    base.forEach((notebook) => {
      map.set(notebook.metaData.bookId, notebook);
    });
  }
  updates.forEach((notebook) => {
    map.set(notebook.metaData.bookId, notebook);
  });
  return Array.from(map.values());
};

export const useWeReadPersistence = (options: UseWeReadPersistenceOptions) => {
  const { isConnected, onSuccess, onError } = options;
  const { buildNotebookRow } = useWeReadData();

  const [rows, setRows] = useState<RowData[]>([]);
  const [detailMap, setDetailMap] = useState<Record<string, Descendant[]>>({});
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [databaseRefreshKey, setDatabaseRefreshKey] = useState(0);
  const [sessionValidated, setSessionValidated] = useState(false);

  const notebooksRef = useRef<Notebook[]>([]);
  const retryQueueRef = useRef<string[]>([]);
  const retryArchiveInfoRef = useRef<
    Record<string, { archiveId?: number; archiveName?: string }>
  >({});
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRetryingRef = useRef(false);
  const silentSyncedRef = useRef(false);

  useEffect(() => {
    notebooksRef.current = notebooks;
  }, [notebooks]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const createNotebookFromMeta = useMemoizedFn(
    (meta: Metadata): Notebook => ({
      metaData: meta,
      chapterHighlights: [],
      bookReview: { chapterReviews: [], bookReviews: [] },
    }),
  );

  const applyNotebookList = useMemoizedFn(
    (nextNotebooks: Notebook[], timestamp?: number) => {
      notebooksRef.current = nextNotebooks;
      setNotebooks(nextNotebooks);
      setRows(nextNotebooks.map((notebook) => buildNotebookRow(notebook)));
      setDetailMap((previous) => {
        const nextDetails: Record<string, Descendant[]> = {};
        nextNotebooks.forEach((notebook) => {
          const bookId = notebook.metaData.bookId;
          if (notebook.chapterHighlights.length > 0) {
            nextDetails[bookId] = convertNotebookToSlate(notebook);
          } else if (previous[bookId]) {
            nextDetails[bookId] = previous[bookId];
          }
        });
        return nextDetails;
      });
      if (typeof timestamp === "number") {
        setLastSyncedAt(timestamp);
      }
      setDatabaseRefreshKey((key) => key + 1);
    },
  );

  const clearRetryState = useMemoizedFn(() => {
    retryQueueRef.current = [];
    retryArchiveInfoRef.current = {};
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    isRetryingRef.current = false;
  });

  const scheduleNextRetry = useMemoizedFn(() => {
    if (retryQueueRef.current.length === 0) {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }
    if (retryTimerRef.current || isRetryingRef.current) {
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      runRetryBatch();
    }, 60 * 1000);
  });

  const runRetryBatch = useMemoizedFn(async () => {
    if (isRetryingRef.current) return;
    if (retryQueueRef.current.length === 0) return;

    isRetryingRef.current = true;
    const batchIds = retryQueueRef.current.splice(0, 100);
    const batchArchiveInfo: Record<
      string,
      { archiveId?: number; archiveName?: string }
    > = {};
    batchIds.forEach((bookId) => {
      const info = retryArchiveInfoRef.current[bookId];
      if (info) {
        batchArchiveInfo[bookId] = info;
      }
    });

    try {
      const result = await weReadService.fetchMetadataByBookIds(
        batchIds,
        batchArchiveInfo,
      );
      if (result.metadataList.length > 0) {
        const updates = result.metadataList.map((meta) =>
          createNotebookFromMeta(meta),
        );
        const merged = mergeNotebookLists(notebooksRef.current, updates, false);
        await saveWeReadNotebooks(merged);
        const currentTime = Date.now();
        await updateWeReadSyncTime(currentTime);
        applyNotebookList(merged, currentTime);
      }

      if (result.failedBookIds.length > 0) {
        const existing = new Set(retryQueueRef.current);
        result.failedBookIds.forEach((bookId) => {
          if (!existing.has(bookId)) {
            existing.add(bookId);
            retryQueueRef.current.push(bookId);
          }
        });
      }
      const successfulIds = new Set(
        batchIds.filter((bookId) => !result.failedBookIds.includes(bookId)),
      );
      successfulIds.forEach((bookId) => {
        delete retryArchiveInfoRef.current[bookId];
      });
    } catch (retryError) {
      console.error("[WeRead] metadata retry failed", retryError);
      const existing = new Set(retryQueueRef.current);
      batchIds.forEach((bookId) => {
        if (!existing.has(bookId)) {
          existing.add(bookId);
          retryQueueRef.current.push(bookId);
        }
      });
    } finally {
      isRetryingRef.current = false;
      scheduleNextRetry();
    }
  });

  const enqueueRetry = useMemoizedFn(
    (bookIds: string[], archiveInfo: MetadataListResult["bookArchiveInfo"]) => {
      if (bookIds.length === 0) return;
      const existing = new Set(retryQueueRef.current);
      bookIds.forEach((bookId) => {
        if (!existing.has(bookId)) {
          existing.add(bookId);
          retryQueueRef.current.push(bookId);
        }
      });
      retryArchiveInfoRef.current = {
        ...retryArchiveInfoRef.current,
        ...archiveInfo,
      };
      scheduleNextRetry();
    },
  );

  const loadFromDatabase = useMemoizedFn(async () => {
    try {
      const [savedNotebooks, savedSyncTime] = await Promise.all([
        getAllWeReadNotebooks(),
        getWeReadLastSyncTime(),
      ]);
      if (savedNotebooks.length > 0) {
        applyNotebookList(savedNotebooks, savedSyncTime ?? undefined);
      }
    } catch (loadError) {
      console.error("[WeRead] load notebooks failed", loadError);
      const msg =
        loadError instanceof Error ? loadError.message : "加载微信读书缓存失败";
      setError(msg);
      onError?.(msg);
    }
  });

  /**
   * 验证 session 是否有效
   * 在页面加载时主动验证登录状态
   */
  const validateSession = useMemoizedFn(async () => {
    if (!isConnected) {
      setSessionValidated(true);
      return;
    }

    try {
      console.log("[WeRead] 验证登录状态...");
      const isValid = await weReadService.validateSession();
      if (!isValid) {
        console.warn("[WeRead] Session 验证失败，登录已失效");
        setError("登录状态已过期，请重新登录");
      } else {
        console.log("[WeRead] Session 验证成功");
      }
      setSessionValidated(true);
    } catch (validationError) {
      console.error("[WeRead] Session 验证异常", validationError);
      // 验证失败时不影响用户体验，静默处理
      setSessionValidated(true);
    }
  });

  const syncAllBooks = useMemoizedFn(
    async (syncOptions: { silent?: boolean } = {}) => {
      try {
        const result = await weReadService.getMetadataList();
        if (result.metadataList.length === 0) {
          console.warn("[WeRead] metadata list is empty");
          if (!syncOptions.silent) {
            onError?.("未能获取到任何图书的基础信息");
          }
          return;
        }

        const notebooksToSave = result.metadataList.map((meta) =>
          createNotebookFromMeta(meta),
        );
        const merged = mergeNotebookLists([], notebooksToSave, true);

        await saveWeReadNotebooks(merged);
        const currentTime = Date.now();
        await updateWeReadSyncTime(currentTime);
        applyNotebookList(merged, currentTime);

        clearRetryState();
        if (result.failedBookIds.length > 0) {
          enqueueRetry(result.failedBookIds, result.bookArchiveInfo);
        }

        if (!syncOptions.silent) {
          onSuccess?.(`同步完成，共同步 ${merged.length} 本书`);
        }
      } catch (syncError) {
        if (syncOptions.silent) {
          console.error("[WeRead] silent sync failed", syncError);
          return;
        }
        console.error("[WeRead] sync failed", syncError);
        const msg =
          syncError instanceof Error
            ? syncError.message
            : "同步失败，请稍后再试";
        setError(msg);
        onError?.(msg);
      }
    },
  );

  const syncFromWeRead = useMemoizedFn(async () => {
    if (!isConnected) {
      onError?.("请先登录微信读书");
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      await syncAllBooks();
    } finally {
      setSyncing(false);
    }
  });

  const silentSync = useMemoizedFn(async () => {
    if (!isConnected || syncing) return;
    await syncAllBooks({ silent: true });
  });

  // 在数据库连接或切换时重新加载数据
  useDatabaseChangeEffect(() => {
    // 重置状态
    setSessionValidated(false);
    silentSyncedRef.current = false;
    // 加载数据库中的数据
    loadFromDatabase();
  });

  // 在 isConnected 变化时验证 session
  useEffect(() => {
    if (isConnected && !sessionValidated) {
      validateSession();
    }
  }, [isConnected, sessionValidated, validateSession]);

  useEffect(() => {
    if (isConnected && !silentSyncedRef.current && sessionValidated) {
      silentSyncedRef.current = true;
      setTimeout(() => {
        silentSync();
      }, 1000);
    }
  }, [isConnected, sessionValidated, silentSync]);

  const fetchBookDetail = useMemoizedFn(
    async (bookId: string): Promise<Descendant[] | null> => {
      const notebook = notebooksRef.current.find(
        (nb) => nb.metaData.bookId === bookId,
      );
      if (!notebook) {
        console.warn(`[WeRead] notebook for ${bookId} missing`);
        return null;
      }

      try {
        const updatedNotebook =
          await weReadService.fetchNotebookDetail(notebook);
        const descendants = convertNotebookToSlate(updatedNotebook);

        setNotebooks((prev) =>
          prev.map((nb) =>
            nb.metaData.bookId === bookId ? updatedNotebook : nb,
          ),
        );
        setDetailMap((prevDetails) => ({
          ...prevDetails,
          [bookId]: descendants,
        }));

        const merged = notebooksRef.current.map((nb) =>
          nb.metaData.bookId === bookId ? updatedNotebook : nb,
        );
        notebooksRef.current = merged;
        await saveWeReadNotebooks(merged);

        return descendants;
      } catch (detailError) {
        console.error("[WeRead] fetch notebook detail failed", detailError);
        return null;
      }
    },
  );

  return {
    rows,
    detailMap,
    notebooks,
    syncing,
    error,
    lastSyncedAt,
    databaseRefreshKey,
    syncBooks: syncFromWeRead,
    fetchBookDetail,
  };
};
