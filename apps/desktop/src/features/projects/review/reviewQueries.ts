/**
 * 项目回顾的数据（KL-065）：读一个项目的回顾（生长 / 结项）；点「回顾」时没有就立即写一次。
 * 主进程写入后广播 knowledge-insights:changed，统一失效。「AI 洞见」槽没配时入口不出现。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProjectReview,
  markKnowledgeInsightSeen,
  reviewProject,
  setKnowledgeInsightStatus,
} from "@/commands/knowledge-insights";
import { on } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { queryClient as appQueryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import type { InsightStatus } from "@/types/content-insights";
import type { KnowledgeInsightNode } from "@/types/knowledge-insights";

const ROOT = "knowledge-insights";

on("knowledge-insights:changed", () => {
  void appQueryClient.invalidateQueries({ queryKey: [ROOT] });
});

export function useProjectReviewData(projectId: number) {
  const database = useSettingStore(state => state.setting.database.active);
  const slot = useSettingStore(state => state.setting.llmUsageSettings.contentInsights);
  const connected = useDatabaseConnected();
  const enabled = Boolean(slot?.providerId && slot.modelId);
  const queryClient = useQueryClient();
  const key = [ROOT, database.replace(/\.db$/, ""), "project", projectId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => getProjectReview(projectId),
    enabled: enabled && connected && projectId > 0,
  });
  const review = useMutation({
    mutationFn: () => reviewProject(projectId),
    onSuccess: node => queryClient.setQueryData(key, node),
  });
  const setStatus = useMutation({
    mutationFn: (input: { nodeId: number; itemId: string; status: InsightStatus }) =>
      setKnowledgeInsightStatus(input.nodeId, input.itemId, input.status),
    onMutate: ({ itemId, status }) => {
      queryClient.setQueryData<KnowledgeInsightNode | null | undefined>(key, current =>
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
  const markSeen = (nodeId: number) => {
    markKnowledgeInsightSeen(nodeId).catch(() => undefined);
  };
  return { enabled, data: query.data ?? null, review, setStatus, markSeen };
}
