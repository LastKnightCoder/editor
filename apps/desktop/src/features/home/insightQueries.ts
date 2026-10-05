/**
 * 今日页「洞见」卡的数据：读主题与全局层的结果与项目回顾（与知识地图同一个缓存键），挑出还没处理的。
 * 「AI 洞见」槽没配时不取。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  getKnowledgeInsights,
  markKnowledgeInsightSeen,
  setKnowledgeInsightStatus,
} from "@/commands/knowledge-insights";
import { on } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { queryClient as appQueryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import { todayInsights, type TodayInsight } from "./insightItems";

const ROOT = "knowledge-insights";

on("knowledge-insights:changed", () => {
  void appQueryClient.invalidateQueries({ queryKey: [ROOT] });
});

export function useTodayInsights() {
  const database = useSettingStore(state => state.setting.database.active);
  const slot = useSettingStore(state => state.setting.llmUsageSettings.contentInsights);
  const connected = useDatabaseConnected();
  const enabled = Boolean(slot?.providerId && slot.modelId) && connected;
  const queryClient = useQueryClient();
  const key = [ROOT, database.replace(/\.db$/, "")] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: getKnowledgeInsights,
    enabled,
    refetchOnWindowFocus: true,
  });
  const items = useMemo(
    () => (enabled ? todayInsights(query.data ?? null) : []),
    [enabled, query.data]
  );
  const dismiss = (item: TodayInsight) => {
    const done =
      item.dismiss.type === "seen"
        ? markKnowledgeInsightSeen(item.dismiss.nodeId)
        : setKnowledgeInsightStatus(item.dismiss.nodeId, item.dismiss.itemId, "dismissed");
    done
      .catch(() => undefined)
      .finally(() => void queryClient.invalidateQueries({ queryKey: key }));
  };
  return { items, dismiss };
}
