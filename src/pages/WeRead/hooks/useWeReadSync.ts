import { useState, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import type { RowData } from "@/components/Database/types";
import weReadService from "@/services/weread";
import type { NotebookSnapshot } from "../types";
import { useWeReadData } from "./useWeReadData";
import { convertNotebookToSlate } from "./useWeReadContent";

interface UseWeReadSyncOptions {
  isConnected: boolean;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export const useWeReadSync = (options: UseWeReadSyncOptions) => {
  const { isConnected, onSuccess, onError } = options;
  const { createSnapshot, buildNotebookRow } = useWeReadData();

  const [rows, setRows] = useState<RowData[]>([]);
  const [detailMap, setDetailMap] = useState<Record<string, Descendant[]>>({});
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [bookSnapshots, setBookSnapshots] = useState<
    Record<string, NotebookSnapshot>
  >({});

  // 用于控制首次自动同步
  const hasAutoSyncedRef = useRef(false);

  const syncBooks = useMemoizedFn(async () => {
    if (!isConnected) {
      onError?.("请先在设置中登录微信读书");
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const metas = await weReadService.getMetadataList();
      const previousRowMap = new Map(rows.map((row) => [row.id, row]));
      const nextRows: RowData[] = [];
      const nextDetails: Record<string, Descendant[]> = {};
      const nextSnapshots: Record<string, NotebookSnapshot> = {};
      let updatedCount = 0;
      let skippedCount = 0;

      for (const meta of metas) {
        const snapshot = createSnapshot(meta);
        const prevSnapshot = bookSnapshots[meta.bookId];
        const hasChanges =
          !prevSnapshot ||
          snapshot.noteCount !== prevSnapshot.noteCount ||
          snapshot.reviewCount !== prevSnapshot.reviewCount ||
          snapshot.lastReadDate !== prevSnapshot.lastReadDate;

        if (!hasChanges) {
          const existingRow = previousRowMap.get(meta.bookId);
          const existingDetail = detailMap[meta.bookId];
          if (existingRow && existingDetail) {
            nextRows.push({ ...existingRow });
            nextDetails[meta.bookId] = existingDetail;
            nextSnapshots[meta.bookId] = snapshot;
            skippedCount += 1;
            continue;
          }
        }

        try {
          const notebook = await weReadService.buildNotebook(meta);
          const row = buildNotebookRow(notebook);
          const descendants = convertNotebookToSlate(notebook);
          nextRows.push(row);
          nextDetails[row.id] = descendants;
          nextSnapshots[row.id] = snapshot;
          updatedCount += 1;
        } catch (err) {
          console.error("同步单本书籍失败", err);
        }
      }

      setRows(nextRows);
      setDetailMap(nextDetails);
      setBookSnapshots(nextSnapshots);
      setLastSyncedAt(Date.now());
      const total = metas.length;
      onSuccess?.(
        `同步完成（共 ${total} 本，更新 ${updatedCount} 本，跳过 ${skippedCount} 本）`,
      );
    } catch (err) {
      console.error("同步微信读书失败", err);
      const msg =
        err instanceof Error ? err.message : "同步微信读书失败，请稍后重试";
      setError(msg);
      onError?.(msg);
    } finally {
      setSyncing(false);
    }
  });

  // 首次自动同步
  useEffect(() => {
    if (
      isConnected &&
      rows.length === 0 &&
      !syncing &&
      !hasAutoSyncedRef.current
    ) {
      hasAutoSyncedRef.current = true;
      syncBooks();
    }
  }, [isConnected, rows.length, syncing, syncBooks]);

  return {
    rows,
    detailMap,
    syncing,
    error,
    lastSyncedAt,
    syncBooks,
  };
};
