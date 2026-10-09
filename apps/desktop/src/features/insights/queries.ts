/**
 * AI 洞见的数据：已有结果走 react-query；分析是一次显式动作（mutation），结果写回同一个缓存键。
 * 「AI 洞见」槽没配时 enabled = false，入口不出现。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  analyzeContentInsights,
  cancelContentInsights,
  getContentInsights,
  onContentInsightsPhase,
  setContentInsightStatus,
} from "@/commands/content-insights";
import type { EntityRef } from "@/entity/ref";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import type {
  ContentInsights,
  ContentInsightsPhase,
  InsightStatus,
} from "@/types/content-insights";

const databaseId = (database: string) => database.replace(/\.db$/, "");

export const insightsKey = (database: string, ref: EntityRef) =>
  ["content-insights", databaseId(database), ref.kind, ref.id] as const;

/** 「AI 洞见」槽配了模型 */
export function useInsightsEnabled() {
  const slot = useSettingStore(state => state.setting.llmUsageSettings.contentInsights);
  return Boolean(slot?.providerId && slot.modelId);
}

export function useContentInsights(ref: EntityRef, getSeed?: () => EntityRef[]) {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  const enabled = useInsightsEnabled();
  const queryClient = useQueryClient();
  const key = insightsKey(database, ref);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getContentInsights(ref),
    enabled: enabled && connected && ref.id > 0,
    // 正文改动后要重新判断是否过期：打开洞见时重新取
    staleTime: 0,
  });
  const analyze = useMutation({
    mutationFn: () => analyzeContentInsights(ref, getSeed?.() ?? []),
    onSuccess: result => queryClient.setQueryData(key, result),
  });
  const setStatus = useMutation({
    mutationFn: (input: { itemId: string; status: InsightStatus }) => {
      const current = queryClient.getQueryData<ContentInsights | null>(key);
      if (!current) return Promise.resolve(false);
      return setContentInsightStatus(current.contentId, input.itemId, input.status);
    },
    // 先在缓存里改，界面立即反馈；失败时重新取
    onMutate: ({ itemId, status }) => {
      queryClient.setQueryData<ContentInsights | null>(key, current =>
        current
          ? {
              ...current,
              result: {
                ...current.result,
                marks: current.result.marks.map(mark =>
                  mark.id === itemId ? { ...mark, status } : mark
                ),
                asks: current.result.asks.map(ask =>
                  ask.id === itemId ? { ...ask, status } : ask
                ),
              },
            }
          : current
      );
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  return {
    enabled,
    insights: query.data ?? null,
    loading: query.isPending && query.fetchStatus !== "idle",
    refetch: query.refetch,
    analyze,
    cancel: () => cancelContentInsights(ref),
    setStatus,
  };
}

/** 分析中的阶段（只收这一份正文的） */
export function useInsightsPhase(contentId: number | null, active: boolean) {
  const [phase, setPhase] = useState<ContentInsightsPhase | null>(null);
  useEffect(() => {
    if (!active) {
      setPhase(null);
      return;
    }
    return onContentInsightsPhase(next => {
      if (contentId == null || next.contentId === contentId) setPhase(next);
    });
  }, [active, contentId]);
  return phase;
}
