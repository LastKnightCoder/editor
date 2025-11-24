import { useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import type { Notebook, Metadata } from "@/types/weread";
import type { Descendant } from "slate";
import type { RowData } from "@/components/Database/types";
import {
  getAllWeReadNotebooks,
  saveWeReadNotebooks,
  getWeReadLastSyncTime,
  updateWeReadSyncTime,
} from "@/commands/weread";
import { useWeReadData } from "./useWeReadData";
import { convertNotebookToSlate } from "./useWeReadContent";
import weReadService, { WeReadRateLimitError } from "@/services/weread";
import syncManager from "@/services/weread/sync-manager";
import type { NotebookSnapshot } from "../types";

interface UseWeReadPersistenceOptions {
  isConnected: boolean;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

/**
 * 数据持久化 Hook
 * 负责从数据库加载和保存微信读书数据
 * 支持增量同步和自动加载
 */
export const useWeReadPersistence = (options: UseWeReadPersistenceOptions) => {
  const { isConnected, onSuccess, onError } = options;
  const { createSnapshot, buildNotebookRow } = useWeReadData();

  const [rows, setRows] = useState<RowData[]>([]);
  const [detailMap, setDetailMap] = useState<Record<string, Descendant[]>>({});
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [bookSnapshots, setBookSnapshots] = useState<
    Record<string, NotebookSnapshot>
  >({});

  const silentSyncedRef = useRef(false); // 防止重复静默同步

  // 从数据库加载数据
  const loadFromDatabase = useMemoizedFn(async () => {
    try {
      const [savedNotebooks, savedSyncTime] = await Promise.all([
        getAllWeReadNotebooks(),
        getWeReadLastSyncTime(),
      ]);

      if (savedNotebooks.length > 0) {
        const newRows: RowData[] = [];
        const newDetails: Record<string, Descendant[]> = {};
        const newSnapshots: Record<string, NotebookSnapshot> = {};

        savedNotebooks.forEach((notebook) => {
          const row = buildNotebookRow(notebook);
          const snapshot = createSnapshot(notebook.metaData);

          newRows.push(row);
          newSnapshots[row.id] = snapshot;

          // 只有当书籍有实际笔记内容时，才转换并缓存详情
          // 这样可以强制延迟加载没有笔记或笔记未同步的书籍
          if (notebook.chapterHighlights.length > 0) {
            const descendants = convertNotebookToSlate(notebook);
            newDetails[row.id] = descendants;
          }
        });

        setRows(newRows);
        setDetailMap(newDetails);
        setNotebooks(savedNotebooks);
        setBookSnapshots(newSnapshots);
        setLastSyncedAt(savedSyncTime);
      }
    } catch (error) {
      console.error("从数据库加载数据失败", error);
      const msg = error instanceof Error ? error.message : "加载本地数据失败";
      setError(msg);
      onError?.(msg);
    }
  });

  // 手动同步（从微信读书服务器，支持增量同步）
  const syncFromWeRead = useMemoizedFn(async () => {
    if (!isConnected) {
      onError?.("请先在设置中登录微信读书");
      return;
    }

    // 检查同步管理器状态，如果已在同步中则不重复触发
    const status = syncManager.getStatus();
    if (status.isSyncing) {
      onError?.("正在同步中，请稍后再试");
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      // 并行获取书架数据和书籍元数据
      const [shelfData, metas] = await Promise.all([
        weReadService.getShelfData(),
        weReadService.getMetadataList(),
      ]);

      // 从 shelf 获取所有书籍ID（更完整）
      const allBookIds = new Set<string>();
      shelfData.archives.forEach((archive) => {
        archive.bookIds.forEach((bookId) => allBookIds.add(bookId));
      });

      // 创建一个 Map 便于查找 metadata
      const metaMap = new Map(metas.map((m) => [m.bookId, m]));

      // 为所有书籍构建元数据（包括没有笔记的书籍）
      const allMetasWithArchive: Metadata[] = [];
      const booksNeedMetadata: string[] = []; // 需要获取元数据的书籍 ID

      for (const bookId of allBookIds) {
        const meta = metaMap.get(bookId);
        const archiveName = shelfData.bookArchiveMap.get(bookId);

        if (meta) {
          // 已有 metadata（有笔记的书籍）
          if (archiveName) {
            meta.archiveName = archiveName;
          }
          allMetasWithArchive.push(meta);
        } else {
          // 没有 metadata（没有笔记的书籍），需要获取
          booksNeedMetadata.push(bookId);
        }
      }

      // 为没有 metadata 的书籍获取元数据（批量，使用同步管理器控制速率）
      if (booksNeedMetadata.length > 0) {
        // 每 100 本一批，避免一次性调用太多
        const batchSize = 100;
        for (let i = 0; i < booksNeedMetadata.length; i += batchSize) {
          const batch = booksNeedMetadata.slice(i, i + batchSize);

          for (const bookId of batch) {
            try {
              const shelfBook = shelfData.books.get(bookId);
              const meta = await weReadService.buildMetadataFromBookId(
                bookId,
                shelfBook,
              );

              if (meta) {
                const archiveName = shelfData.bookArchiveMap.get(bookId);
                if (archiveName) {
                  meta.archiveName = archiveName;
                }
                allMetasWithArchive.push(meta);
              }
            } catch (err) {
              if (err instanceof WeReadRateLimitError) {
                console.warn("获取元数据时触发 API 限流");
                break;
              }
            }
          }

          // 每批之间暂停 30 秒
          if (i + batchSize < booksNeedMetadata.length) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
        }
      }

      // 筛选需要同步的书籍
      const tasksToSync: Metadata[] = [];
      let skippedCount = 0;

      for (const meta of allMetasWithArchive) {
        const snapshot = createSnapshot(meta);
        const prevSnapshot = bookSnapshots[meta.bookId];

        // 基于 synckey 检查是否有变化（只检查进度，不检查 highlights 和 reviews）
        const hasChanges =
          !prevSnapshot ||
          snapshot.synckeys.progress !== prevSnapshot.synckeys.progress ||
          snapshot.lastReadDate !== prevSnapshot.lastReadDate;

        // 如果有变化或不存在，加入同步队列
        if (
          hasChanges ||
          !notebooks.find((nb) => nb.metaData.bookId === meta.bookId)
        ) {
          tasksToSync.push(meta);
        } else {
          skippedCount += 1;
        }
      }

      console.log(
        `[同步] 共 ${allBookIds.size} 本书，需要同步 ${tasksToSync.length} 本，跳过 ${skippedCount} 本`,
      );

      if (tasksToSync.length === 0) {
        onSuccess?.(`所有书籍均为最新，无需同步`);
        setSyncing(false);
        return;
      }

      // 将任务添加到同步管理器
      syncManager.clearQueue();
      syncManager.addTasks(tasksToSync, 0);

      let updatedCount = 0;
      const allSyncedNotebooks: Notebook[] = [];

      // 启动同步
      await syncManager.startSync({
        onBatchComplete: async (batchNotebooks, batchNumber) => {
          // 更新状态
          const newRows: RowData[] = [];
          const newSnapshots: Record<string, NotebookSnapshot> = {};

          // 合并已有的和新同步的
          const previousNotebookMap = new Map(
            notebooks.map((nb) => [nb.metaData.bookId, nb]),
          );

          batchNotebooks.forEach((notebook) => {
            previousNotebookMap.set(notebook.metaData.bookId, notebook);
            const snapshot = createSnapshot(notebook.metaData);
            newSnapshots[notebook.metaData.bookId] = snapshot;
          });

          // 重新构建所有书籍（包括已有的不需要同步的书籍）
          const allNotebooks: Notebook[] = [];
          for (const meta of allMetasWithArchive) {
            const existingNotebook = previousNotebookMap.get(meta.bookId);
            if (existingNotebook) {
              // 更新分类信息
              existingNotebook.metaData.archiveName = meta.archiveName;
              allNotebooks.push(existingNotebook);
              const row = buildNotebookRow(existingNotebook);
              newRows.push(row);

              // 如果没有 snapshot，创建一个
              if (!newSnapshots[meta.bookId]) {
                newSnapshots[meta.bookId] = createSnapshot(meta);
              }
            }
          }

          allSyncedNotebooks.push(...batchNotebooks);
          updatedCount += batchNotebooks.length;

          // 保存到数据库（每批次保存一次）
          await saveWeReadNotebooks(allNotebooks);
          const currentTime = Date.now();
          await updateWeReadSyncTime(currentTime);

          // 更新状态
          setNotebooks(allNotebooks);
          setRows(newRows);
          setBookSnapshots((prev) => ({ ...prev, ...newSnapshots }));
          setLastSyncedAt(currentTime);

          // 进度提示
          onSuccess?.(
            `批次 ${batchNumber} 完成，已同步 ${updatedCount}/${tasksToSync.length} 本，共显示 ${allNotebooks.length} 本`,
          );
        },
        onComplete: (result) => {
          const total = allBookIds.size;
          const failedMsg =
            result.failed.length > 0 ? `，${result.failed.length} 本失败` : "";

          onSuccess?.(
            `同步完成（共 ${total} 本，更新 ${updatedCount} 本，跳过 ${skippedCount} 本${failedMsg}）`,
          );
        },
        onError: (error, task) => {
          console.error(`同步书籍 ${task.meta.title} 失败`, error);
        },
      });
    } catch (error) {
      console.error("同步微信读书失败", error);
      const msg =
        error instanceof Error ? error.message : "同步失败，请稍后重试";
      setError(msg);
      onError?.(msg);
    } finally {
      setSyncing(false);
    }
  });

  /**
   * 静默同步：后台同步，不显示 loading 状态，失败不提示
   * 使用同步管理器控制速率和批次
   */
  const silentSync = useMemoizedFn(async () => {
    if (!isConnected) return;

    // 检查是否已在同步中
    const status = syncManager.getStatus();
    if (status.isSyncing) {
      return;
    }

    try {
      // 先尝试刷新 Cookie 保持登录状态
      await weReadService.refreshCookie();

      // 并行获取书架数据和书籍元数据
      const [shelfData, metas] = await Promise.all([
        weReadService.getShelfData(),
        weReadService.getMetadataList(),
      ]);

      // 从 shelf 获取所有书籍ID（更完整）
      const allBookIds = new Set<string>();
      shelfData.archives.forEach((archive) => {
        archive.bookIds.forEach((bookId) => allBookIds.add(bookId));
      });

      // 创建一个 Map 便于查找 metadata
      const metaMap = new Map(metas.map((m) => [m.bookId, m]));

      // 筛选需要同步的书籍，并构建所有书籍的元数据映射
      const tasksToSync: Metadata[] = [];
      const allMetasWithArchive: Metadata[] = []; // 所有有元数据的书籍

      for (const bookId of allBookIds) {
        const meta = metaMap.get(bookId);
        const archiveName = shelfData.bookArchiveMap.get(bookId);

        if (!meta) continue;

        if (archiveName) {
          meta.archiveName = archiveName;
        }

        allMetasWithArchive.push(meta);

        const snapshot = createSnapshot(meta);
        const prevSnapshot = bookSnapshots[meta.bookId];

        // 基于 synckey 检查是否有变化（只检查进度，不检查 highlights 和 reviews）
        const hasChanges =
          !prevSnapshot ||
          snapshot.synckeys.progress !== prevSnapshot.synckeys.progress ||
          snapshot.lastReadDate !== prevSnapshot.lastReadDate;

        // 如果有变化或不存在，加入同步队列
        if (
          hasChanges ||
          !notebooks.find((nb) => nb.metaData.bookId === meta.bookId)
        ) {
          tasksToSync.push(meta);
        }
      }

      if (tasksToSync.length === 0) {
        return;
      }

      // 将任务添加到同步管理器（低优先级）
      syncManager.clearQueue();
      syncManager.addTasks(tasksToSync, 10);

      // 启动同步
      await syncManager.startSync({
        onBatchComplete: async (batchNotebooks) => {
          // 更新状态
          const newRows: RowData[] = [];
          const newSnapshots: Record<string, NotebookSnapshot> = {};

          // 合并已有的和新同步的
          const previousNotebookMap = new Map(
            notebooks.map((nb) => [nb.metaData.bookId, nb]),
          );

          batchNotebooks.forEach((notebook) => {
            previousNotebookMap.set(notebook.metaData.bookId, notebook);
            const snapshot = createSnapshot(notebook.metaData);
            newSnapshots[notebook.metaData.bookId] = snapshot;
          });

          // 重新构建所有书籍（包括已有的不需要同步的书籍）
          const allNotebooks: Notebook[] = [];
          for (const meta of allMetasWithArchive) {
            const existingNotebook = previousNotebookMap.get(meta.bookId);
            if (existingNotebook) {
              // 更新分类信息
              existingNotebook.metaData.archiveName = meta.archiveName;
              allNotebooks.push(existingNotebook);
              const row = buildNotebookRow(existingNotebook);
              newRows.push(row);

              // 如果没有 snapshot，创建一个
              if (!newSnapshots[meta.bookId]) {
                newSnapshots[meta.bookId] = createSnapshot(meta);
              }
            }
          }

          // 保存到数据库（每批次保存一次）
          await saveWeReadNotebooks(allNotebooks);
          const currentTime = Date.now();
          await updateWeReadSyncTime(currentTime);

          // 更新状态
          setNotebooks(allNotebooks);
          setRows(newRows);
          setBookSnapshots((prev) => ({ ...prev, ...newSnapshots }));
          setLastSyncedAt(currentTime);
        },
      });
    } catch (error) {
      console.error("[静默同步] 失败", error);
      // 静默同步失败不提示用户
    }
  });

  // 初始加载数据库数据
  useEffect(() => {
    loadFromDatabase();
  }, [loadFromDatabase]);

  // 静默同步：加载数据库后自动在后台同步
  useEffect(() => {
    if (isConnected && !silentSyncedRef.current) {
      silentSyncedRef.current = true;
      // 延迟 1 秒开始静默同步，避免阻塞初始渲染
      setTimeout(() => {
        silentSync();
      }, 1000);
    }
  }, [isConnected, silentSync]);

  /**
   * 获取书籍的详情（高亮和评论）
   * 每次调用都从服务器实时获取最新数据
   */
  const fetchBookDetail = useMemoizedFn(
    async (bookId: string): Promise<Descendant[] | null> => {
      const notebook = notebooks.find((nb) => nb.metaData.bookId === bookId);
      if (!notebook) return null;

      try {
        // 实时获取高亮和评论详情
        const updatedNotebook =
          await weReadService.fetchNotebookDetail(notebook);
        const descendants = convertNotebookToSlate(updatedNotebook);

        // 更新状态
        setNotebooks((prev) =>
          prev.map((nb) =>
            nb.metaData.bookId === bookId ? updatedNotebook : nb,
          ),
        );
        setDetailMap((prev) => ({ ...prev, [bookId]: descendants }));

        // 保存到数据库
        await saveWeReadNotebooks(
          notebooks.map((nb) =>
            nb.metaData.bookId === bookId ? updatedNotebook : nb,
          ),
        );

        return descendants;
      } catch (error) {
        console.error(`获取书籍 ${bookId} 详情失败`, error);
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
    syncBooks: syncFromWeRead,
    fetchBookDetail,
  };
};
