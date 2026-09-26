/**
 * 微信读书数据层：书架与单本笔记走 react-query（按工作区数据库分 key）；
 * 书架同步是跨页面的一次性任务，状态放模块级 store（同一时刻只跑一轮）。
 *
 * 数据流：API Key → Agent Gateway（只读）→ SQLite 缓存（weread_notebook）→ 本域查询。
 * 书架同步只拉元数据（默认增量）；划线 / 想法在打开某本书时按需拉取并回写缓存。
 */

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { toast } from "@tau/ui";
import {
  deleteWeReadNotebook,
  getAllWeReadNotebooks,
  getWeReadLastSyncTime,
  getWeReadNotebookById,
  saveWeReadNotebook,
  saveWeReadNotebooks,
  updateWeReadSyncTime,
} from "@/commands/weread";
import weReadService from "@/services/weread";
import useSettingStore from "@/stores/useSettingStore";
import type { Metadata, Notebook } from "@/types/weread";
import { hasNotes, preferNonEmpty, toBook, type WeReadBook } from "./model";

const hasBridge = typeof window !== "undefined" && Boolean(window.electron);
const activeDatabase = () => useSettingStore.getState().setting.database.active;

const shelfKey = (database: string) => ["weread", "shelf", database] as const;
const bookKey = (database: string, bookId: string, connected: boolean) =>
  ["weread", "book", database, bookId, connected] as const;

interface ShelfData {
  notebooks: Notebook[];
  lastSyncedAt: number | null;
}

/* ───────── 连接状态 ───────── */

export type WeReadConnection = "none" | "checking" | "valid" | "invalid";

/** none = 未填 Key；checking = 启动校验中（尚无结论） */
export function useWeReadConnection(): WeReadConnection {
  const weread = useSettingStore(s => s.setting.integration.weread);
  if (!weread.apiKey.trim()) return "none";
  if (weread.connectionStatus === "valid") return "valid";
  if (weread.connectionStatus === "invalid") return "invalid";
  return "checking";
}

/* ───────── 书架 ───────── */

export function useWeReadShelf() {
  const database = useSettingStore(s => s.setting.database.active);
  const query = useQuery({
    queryKey: shelfKey(database),
    queryFn: async (): Promise<ShelfData> => {
      if (!hasBridge) return { notebooks: [], lastSyncedAt: null };
      const [notebooks, lastSyncedAt] = await Promise.all([
        getAllWeReadNotebooks(),
        getWeReadLastSyncTime(),
      ]);
      return { notebooks, lastSyncedAt };
    },
    // 只有本域写入（同步 / 拉详情），写入处直接更新缓存
    staleTime: Infinity,
  });
  const books = useMemo<WeReadBook[]>(
    () => (query.data?.notebooks ?? []).map(toBook),
    [query.data]
  );
  return {
    books,
    lastSyncedAt: query.data?.lastSyncedAt ?? null,
    loading: query.isPending,
    error: query.error,
  };
}

/* ───────── 同步 ───────── */

interface SyncState {
  syncing: boolean;
  progress: { completed: number; total: number } | null;
  /** 本次运行里已自动同步过的数据库（每个库只自动同步一次） */
  autoSynced: string[];
}

export const useWeReadSyncStore = create<SyncState>(() => ({
  syncing: false,
  progress: null,
  autoSynced: [],
}));

/** 新元数据并入缓存：保留已拉取过的划线 / 想法，去掉已不在书架与笔记本里的书 */
function mergeMetadata(existing: Notebook[], metas: Metadata[], removed: Set<string>): Notebook[] {
  const map = new Map(existing.map(nb => [nb.metaData.bookId, nb]));
  for (const bookId of removed) map.delete(bookId);
  for (const meta of metas) {
    const prev = map.get(meta.bookId);
    map.set(
      meta.bookId,
      prev
        ? { ...prev, metaData: meta }
        : {
            metaData: meta,
            chapterHighlights: [],
            bookReview: { chapterReviews: [], bookReviews: [] },
          }
    );
  }
  return [...map.values()];
}

async function readCachedNotebooks(client: QueryClient, database: string) {
  return (
    client.getQueryData<ShelfData>(shelfKey(database))?.notebooks ?? (await getAllWeReadNotebooks())
  );
}

/**
 * 同步书架元数据（默认增量：只对新书和最近读过 / 新记笔记的书逐本补拉详情，见
 * WeReadService.syncMetadata）。full = 全部重新补拉，请求量约为每本书 2 个。
 * silent = 进入页面时的后台同步：不显示进度与结果提示。同步期间切换工作区则放弃写入。
 */
export async function syncShelf(
  client: QueryClient,
  { silent = false, full = false }: { silent?: boolean; full?: boolean } = {}
) {
  const store = useWeReadSyncStore;
  if (store.getState().syncing) return;
  const database = activeDatabase();
  store.setState({ syncing: true, progress: silent ? null : { completed: 0, total: 0 } });
  try {
    const cached = await readCachedNotebooks(client, database);
    const result = await weReadService.syncMetadata(
      cached.map(nb => nb.metaData),
      { full, onProgress: silent ? undefined : progress => store.setState({ progress }) }
    );
    if (activeDatabase() !== database) return;
    if (result.metadataList.length === 0 && cached.length > 0) {
      // 网关返回空书架时不清空本地缓存
      if (!silent) toast.error("没有获取到任何书籍信息");
      return;
    }
    const removed = new Set(result.removedBookIds);
    const merged = mergeMetadata(
      await readCachedNotebooks(client, database),
      result.metadataList,
      removed
    );
    const updated = new Set(result.metadataList.map(m => m.bookId));
    await saveWeReadNotebooks(merged.filter(nb => updated.has(nb.metaData.bookId)));
    await Promise.all([...removed].map(bookId => deleteWeReadNotebook(bookId)));
    const now = Date.now();
    await updateWeReadSyncTime(now);
    if (activeDatabase() !== database) return;
    client.setQueryData<ShelfData>(shelfKey(database), { notebooks: merged, lastSyncedAt: now });
    if (!silent) {
      const failed = result.failedBookIds.length;
      toast.success(
        `同步完成，共 ${merged.length} 本书，更新 ${result.requested - failed} 本` +
          (failed ? `，${failed} 本下次重试` : "")
      );
    }
  } catch (error) {
    console.error("[WeRead] 同步失败", error);
    if (!silent) toast.error(error instanceof Error ? error.message : "同步失败，请稍后再试");
  } finally {
    store.setState({ syncing: false, progress: null });
  }
}

/** 已连接且缓存读完后，每个数据库在本次运行里自动后台同步一次 */
export function useAutoSync(connected: boolean, ready: boolean) {
  const client = useQueryClient();
  const database = useSettingStore(s => s.setting.database.active);
  useEffect(() => {
    if (!connected || !ready || !hasBridge) return;
    if (useWeReadSyncStore.getState().autoSynced.includes(database)) return;
    useWeReadSyncStore.setState(s => ({ autoSynced: [...s.autoSynced, database] }));
    const timer = setTimeout(() => void syncShelf(client, { silent: true }), 1000);
    return () => clearTimeout(timer);
  }, [client, connected, ready, database]);
}

/* ───────── 单本笔记 ───────── */

export interface BookDetail {
  notebook: Notebook;
  /** 本次是否从微信读书拉到了最新笔记（否则是本地缓存） */
  fresh: boolean;
  error: string | null;
}

/**
 * 打开一本书：先显示缓存，已连接时拉最新划线 / 想法并回写缓存。
 * 拉取失败时回落缓存并带上错误原因。
 */
export function useWeReadBook(bookId: string) {
  const client = useQueryClient();
  const database = useSettingStore(s => s.setting.database.active);
  const connected = useWeReadConnection() === "valid";

  const query = useQuery({
    queryKey: bookKey(database, bookId, connected),
    queryFn: async (): Promise<BookDetail | null> => {
      if (!hasBridge) return null;
      const cached = await getWeReadNotebookById(bookId);
      if (!cached) return null;
      if (!connected) return { notebook: cached, fresh: false, error: null };
      try {
        const next = preferNonEmpty(cached, await weReadService.fetchNotebookDetail(cached));
        if (activeDatabase() === database) {
          await saveWeReadNotebook(next);
          client.setQueryData<ShelfData>(shelfKey(database), data =>
            data
              ? {
                  ...data,
                  notebooks: data.notebooks.map(nb => (nb.metaData.bookId === bookId ? next : nb)),
                }
              : data
          );
        }
        return { notebook: next, fresh: true, error: null };
      } catch (error) {
        console.error("[WeRead] 拉取笔记失败", error);
        return {
          notebook: cached,
          fresh: false,
          error: error instanceof Error ? error.message : "拉取笔记失败",
        };
      }
    },
    placeholderData: () => {
      const notebook = client
        .getQueryData<ShelfData>(shelfKey(database))
        ?.notebooks.find(nb => nb.metaData.bookId === bookId);
      return notebook && hasNotes(notebook) ? { notebook, fresh: false, error: null } : undefined;
    },
    staleTime: 5 * 60_000,
  });

  return {
    detail: query.data ?? null,
    loading: query.isPending,
    /** 正在从微信读书拉取（缓存已在显示） */
    refreshing: query.isFetching,
    refresh: () => void query.refetch(),
  };
}
