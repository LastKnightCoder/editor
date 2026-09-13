// diary 域查询 hooks：组件直接订阅 query 缓存（单一状态源），
// mutation 后由 useDiaryStore 的 invalidate/setQueryData 驱动刷新。

import { useQuery } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
import type { DiaryTagSetting } from "../../types";

const DIARY_STALE_MS = 30_000;

export function useDiaryEntries(enabled = true) {
  return useQuery({
    queryKey: ["diary", "entries"],
    queryFn: () => tauri.diaryListEntries(),
    staleTime: DIARY_STALE_MS,
    enabled,
  });
}

export function useDiaryTagSettings(enabled = true) {
  return useQuery({
    queryKey: ["diary", "tagSettings"],
    queryFn: () => tauri.diaryGetTagSettings(),
    staleTime: DIARY_STALE_MS,
    enabled,
  });
}

import { getQueryClient } from "../../router";
import type { DiaryEntry } from "../../types";

/** 命令式读取（store 的导航/mutation 编排用）：命中缓存或拉取 */
export async function readDiaryEntries(): Promise<DiaryEntry[]> {
  return getQueryClient().fetchQuery({
    queryKey: ["diary", "entries"],
    queryFn: () => tauri.diaryListEntries(),
    staleTime: DIARY_STALE_MS,
  });
}

/** 命令式读取标签库（tab 预热用）：命中缓存或拉取 */
export async function readDiaryTagSettings(): Promise<DiaryTagSetting[]> {
  return getQueryClient().fetchQuery({
    queryKey: ["diary", "tagSettings"],
    queryFn: () => tauri.diaryGetTagSettings(),
    staleTime: DIARY_STALE_MS,
  });
}

/** 乐观写入 entries 缓存（mutation 编排用） */
export function writeDiaryEntries(updater: (prev: DiaryEntry[]) => DiaryEntry[]): void {
  const queryClient = getQueryClient();
  const prev = queryClient.getQueryData<DiaryEntry[]>(["diary", "entries"]) ?? [];
  queryClient.setQueryData(["diary", "entries"], updater(prev));
}

/** 标签库变更后回填缓存（后端返回的是全量列表） */
export function writeDiaryTagSettings(settings: DiaryTagSetting[]): void {
  getQueryClient().setQueryData(["diary", "tagSettings"], settings);
}
