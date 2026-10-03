/**
 * 主题与全局层 AI 洞见的数据（KL-060）：后台按变化量生成，这里读结果；点「AI 洞见」时立即分析一次。
 * 主进程写入后广播 knowledge-insights:changed，统一失效。「AI 洞见」槽没配时 enabled = false，入口不出现。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  analyzeKnowledgeInsights,
  getKnowledgeInsights,
  onKnowledgeInsightsPhase,
  setKnowledgeInsightStatus,
} from "@/commands/knowledge-insights";
import { on } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useInsightsEnabled } from "@/features/insights/queries";
import { queryClient as appQueryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import type { InsightStatus } from "@/types/content-insights";
import type {
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeInsightsPhase,
} from "@/types/knowledge-insights";

const ROOT = "knowledge-insights";

export const knowledgeInsightsKey = (database: string) =>
  [ROOT, database.replace(/\.db$/, "")] as const;

on("knowledge-insights:changed", () => {
  void appQueryClient.invalidateQueries({ queryKey: [ROOT] });
});

/** 一处结果里改一条的状态（乐观更新用） */
function withStatus(
  node: KnowledgeInsightNode,
  itemId: string,
  status: InsightStatus
): KnowledgeInsightNode {
  return {
    ...node,
    result: {
      ...node.result,
      marks: node.result.marks.map(mark => (mark.id === itemId ? { ...mark, status } : mark)),
      asks: node.result.asks.map(ask => (ask.id === itemId ? { ...ask, status } : ask)),
    },
  };
}

export function useKnowledgeInsights() {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  const enabled = useInsightsEnabled();
  const queryClient = useQueryClient();
  const key = knowledgeInsightsKey(database);
  const query = useQuery({
    queryKey: key,
    queryFn: getKnowledgeInsights,
    enabled: enabled && connected,
    refetchOnWindowFocus: true,
  });
  const analyze = useMutation({
    mutationFn: analyzeKnowledgeInsights,
    onSuccess: result => queryClient.setQueryData(key, result),
  });
  const setStatus = useMutation({
    mutationFn: (input: { nodeId: number; itemId: string; status: InsightStatus }) =>
      setKnowledgeInsightStatus(input.nodeId, input.itemId, input.status),
    // 先在缓存里改，界面立即反馈；失败时重新取
    onMutate: ({ nodeId, itemId, status }) => {
      queryClient.setQueryData<KnowledgeInsightsPayload | undefined>(key, current =>
        current
          ? {
              ...current,
              global:
                current.global?.id === nodeId
                  ? withStatus(current.global, itemId, status)
                  : current.global,
              topics: current.topics.map(topic =>
                topic.id === nodeId ? withStatus(topic, itemId, status) : topic
              ),
            }
          : current
      );
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  return { enabled, data: query.data ?? null, analyze, setStatus };
}

/** 分析中的阶段（读了几个主题、AI 在判断） */
export function useKnowledgeInsightsPhase(active: boolean) {
  const [phase, setPhase] = useState<KnowledgeInsightsPhase | null>(null);
  useEffect(() => {
    if (!active) {
      setPhase(null);
      return;
    }
    return onKnowledgeInsightsPhase(setPhase);
  }, [active]);
  return phase;
}
