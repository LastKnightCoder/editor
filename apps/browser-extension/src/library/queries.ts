/**
 * 伴读库的数据协议（react-query）：连上 Tau 时页面、站点、全部标注都由 Tau 分页给出；
 * 没连上时页面列表退回本机标注缓存。本机笔记与缓存随 chrome.storage 变化失效重取。
 */
import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  COMPANION_METHODS,
  type LibraryFeedItem,
  type LibraryFeedParams,
  type LibraryList,
  type LibraryPagesParams,
  type LibraryRenameParams,
  type LibrarySite,
  type WebAnnotation,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import { callBackground } from "../shared/extension-page";
import {
  queryCachedFeed,
  queryCachedPages,
  readCachedPages,
  readLocalNotes,
  type StorageSnapshot,
} from "./local";

export const LIBRARY_PAGE_SIZE = 50;

const libraryKeys = {
  all: ["library"] as const,
  local: ["library", "local"] as const,
};

const readSnapshot = () => chrome.storage.local.get(null) as Promise<StorageSnapshot>;

const nextOffset = <T>(last: LibraryList<T>, pages: LibraryList<T>[]) => {
  const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
  return loaded < last.total && last.items.length ? loaded : undefined;
};

export type PagesFilter = Omit<LibraryPagesParams, "offset" | "limit">;

async function fetchPages(params: LibraryPagesParams, online: boolean) {
  if (online)
    return callBackground<LibraryList<WebPageSummary>>(COMPANION_METHODS.libraryPages, params);
  const snapshot = await readSnapshot();
  return queryCachedPages(readCachedPages(snapshot), params, snapshot);
}

/** 离线结果来自本机缓存，挂在 local 下随存储变化失效 */
const dataScope = (online: boolean) => (online ? libraryKeys.all : libraryKeys.local);

export function useLibraryPages(filter: PagesFilter, online: boolean) {
  return useInfiniteQuery({
    queryKey: [...dataScope(online), "pages", filter],
    queryFn: ({ pageParam }) =>
      fetchPages({ ...filter, offset: pageParam, limit: LIBRARY_PAGE_SIZE }, online),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

/** 指定页面的汇总（面板跳过来、从别的视图点进来时，列表里未必已加载到） */
export function useLibraryPage(url: string | null, online: boolean): WebPageSummary | null {
  const page = useQuery({
    queryKey: [...dataScope(online), "page", url],
    queryFn: async () =>
      (await fetchPages({ sort: "recent", url: url ?? undefined, offset: 0, limit: 1 }, online))
        .items[0] ?? null,
    enabled: !!url,
  });
  return url ? (page.data ?? null) : null;
}

export function useLibrarySites(online: boolean) {
  return useQuery({
    queryKey: [...libraryKeys.all, "sites"],
    queryFn: () => callBackground<LibrarySite[]>(COMPANION_METHODS.librarySites, {}),
    enabled: online,
  });
}

export type FeedFilter = Omit<LibraryFeedParams, "offset" | "limit">;

export function useLibraryFeed(filter: FeedFilter, online: boolean) {
  return useInfiniteQuery({
    queryKey: [...dataScope(online), "feed", filter],
    queryFn: async ({ pageParam }) => {
      const params = { ...filter, offset: pageParam, limit: LIBRARY_PAGE_SIZE };
      if (online)
        return callBackground<LibraryList<LibraryFeedItem>>(COMPANION_METHODS.libraryFeed, params);
      return queryCachedFeed(await readSnapshot(), params);
    },
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

/** 一页的全部标注：经后台的标注缓存读（离线时是本机缓存，有未同步的改动先补发） */
export function usePageAnnotations(url: string | null) {
  return useQuery({
    queryKey: [...libraryKeys.local, "annotations", url],
    queryFn: () => callBackground<WebAnnotation[]>("annotations.load", { url }),
    enabled: !!url,
  });
}

export function useLocalNotes() {
  return useQuery({
    queryKey: [...libraryKeys.local, "notes"],
    queryFn: async () => readLocalNotes(await readSnapshot()),
  });
}

export function useRenamePage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: LibraryRenameParams) =>
      callBackground<WebPageSummary>(COMPANION_METHODS.libraryRename, params),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryKeys.all }),
  });
}

const LOCAL_PREFIXES = ["ann:", "note:", "note-meta:", "notes-saved:"];

/** 面板里划线（标注缓存随之更新）、笔记页写草稿时重取；Tau 那边的汇总也随标注变化，一并失效 */
export function useStorageInvalidation(client: QueryClient) {
  useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      const keys = Object.keys(changes);
      if (keys.some(key => LOCAL_PREFIXES.some(prefix => key.startsWith(prefix))))
        void client.invalidateQueries({ queryKey: libraryKeys.all });
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [client]);
}
