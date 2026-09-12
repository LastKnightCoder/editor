// 知识库域查询 hooks：库 + 节点全量拉取，前端组树；关联卡片/文章的引用节点随树返回。

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
import { useInvalidateHomeStats } from "../home/queries";

const STALE_MS = 10_000;

export function useDocumentLibrariesQuery() {
  return useInfiniteQuery({
    queryKey: ["knowledge", "libraries"],
    queryFn: ({ pageParam }) => tauri.documentLibraryList({ offset: pageParam, limit: 40 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: STALE_MS,
  });
}

export function useDocumentLibraryQuery(id: number) {
  return useQuery({
    queryKey: ["knowledge", "library", id],
    queryFn: () => tauri.documentLibraryGet(id),
    enabled: id > 0,
    staleTime: STALE_MS,
  });
}

export function useDocumentItemsQuery() {
  return useQuery({
    queryKey: ["knowledge", "items"],
    queryFn: () => tauri.documentItemList(),
    staleTime: STALE_MS,
  });
}

export function useInvalidateKnowledge() {
  const queryClient = useQueryClient();
  const invalidateHomeStats = useInvalidateHomeStats();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    invalidateHomeStats();
  };
}

export function useLibraryCreate() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (params: { title: string; desc?: string }) => tauri.documentLibraryCreate(params),
    onSuccess: () => invalidate(),
  });
}

export function useLibraryUpdate() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (params: { id: number; title?: string; desc?: string; isTop?: boolean }) =>
      tauri.documentLibraryUpdate(params),
    onSuccess: () => invalidate(),
  });
}

export function useLibraryDelete() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (id: number) => tauri.documentLibraryDelete(id),
    onSuccess: () => invalidate(),
  });
}

export function useDocumentItemCreate() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (params: {
      documentId: number;
      parentId?: number;
      title: string;
      refType?: string;
      refId?: number;
    }) => tauri.documentItemCreate(params),
    onSuccess: () => invalidate(),
  });
}

export function useDocumentItemDelete() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (id: number) => tauri.documentItemDelete(id),
    onSuccess: () => invalidate(),
  });
}
