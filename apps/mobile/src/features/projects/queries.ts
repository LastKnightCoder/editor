// 项目域查询 hooks：项目 + 项目节点一次拉全量，前端组树；mutation 后 invalidate。

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
import { useInvalidateHomeStats } from "../home/queries";

const STALE_MS = 10_000;

export function useProjectsQuery() {
  return useInfiniteQuery({
    queryKey: ["projects", "list"],
    queryFn: ({ pageParam }) => tauri.projectList({ offset: pageParam, limit: 40 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: STALE_MS,
  });
}

export function useProjectQuery(id: number) {
  return useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: () => tauri.projectGet(id),
    enabled: id > 0,
    staleTime: STALE_MS,
  });
}

export function useProjectItemsQuery() {
  return useQuery({
    queryKey: ["projects", "items"],
    queryFn: () => tauri.projectItemList(),
    staleTime: STALE_MS,
  });
}

export function useInvalidateProjects() {
  const queryClient = useQueryClient();
  const invalidateHomeStats = useInvalidateHomeStats();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    invalidateHomeStats();
  };
}

export function useProjectCreate() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (params: { title: string; desc?: string }) => tauri.projectCreate(params),
    onSuccess: () => invalidate(),
  });
}

export function useProjectUpdate() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (params: {
      id: number;
      title?: string;
      desc?: string;
      pinned?: boolean;
      archived?: boolean;
    }) => tauri.projectUpdate(params),
    onSuccess: () => invalidate(),
  });
}

export function useProjectDelete() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: number) => tauri.projectDelete(id),
    onSuccess: () => invalidate(),
  });
}

export function useProjectItemCreate() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (params: {
      projectId: number;
      parentId?: number;
      title: string;
      itemType?: string;
      refType?: string;
      refId?: number;
    }) => tauri.projectItemCreate(params),
    onSuccess: () => invalidate(),
  });
}

export function useProjectItemDelete() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: number) => tauri.projectItemDelete(id),
    onSuccess: () => invalidate(),
  });
}
