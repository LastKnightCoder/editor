/**
 * 「笔记元信息」进度：主进程写入元信息后广播 content-ai-meta:changed（已节流），这里统一失效。
 * 槽变化时 queryKey 跟着变，清空槽后立即读到 configured = false。
 */

import { useQuery } from "@tanstack/react-query";
import { getContentAiStatus } from "@/commands/content-ai";
import { on } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";

const ROOT = "content-ai-status";

on("content-ai-meta:changed", () => {
  void queryClient.invalidateQueries({ queryKey: [ROOT] });
});

export function useContentAiStatus() {
  const database = useSettingStore(state => state.setting.database.active);
  const slot = useSettingStore(state => state.setting.llmUsageSettings.contentMetadata);
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: [ROOT, database, slot?.providerId ?? "", slot?.modelId ?? ""],
    queryFn: getContentAiStatus,
    enabled: connected,
    refetchOnWindowFocus: true,
  });
}
