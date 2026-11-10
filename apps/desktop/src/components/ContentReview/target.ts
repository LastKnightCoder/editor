/**
 * 建议所在的正文：反查它属于哪张卡片 / 文章 / 项目文档，供对话卡片显示标题、跳到正文逐条看。
 */

import { useQuery } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import { bindDatabaseCommands } from "@/services/command-context";
import { locateEntity } from "@/commands/entity";
import { openPage } from "@/services/page-navigation";
import { isElectron } from "@/electron";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import type { EntityLocation } from "@/types";
import { focusSuggestionInDocument, useSuggestionFocus } from "./actions";

export function useSuggestionTarget(contentId: number | undefined, databaseName?: string) {
  const active = useSettingStore(state => state.setting.database.active);
  const database = (databaseName ?? active).replace(/\.db$/, "");
  return useQuery(
    {
      queryKey: ["content-suggestion-target", database, contentId ?? 0],
      queryFn: () =>
        bindDatabaseCommands({ locateEntity }, { databaseName: database }).locateEntity({
          contentId: contentId ?? 0,
        }),
      enabled: isElectron && Boolean(contentId) && Boolean(database),
      staleTime: 5 * 60_000,
    },
    queryClient
  );
}

export const targetLabel = (target: EntityLocation | null | undefined) =>
  target?.title?.trim() ||
  (target?.kind === "card" ? "这张卡片" : target?.kind === "article" ? "这篇文章" : "这篇正文");

/** 打开建议所在的正文并定位到这条建议；正文页面还没准备好时稍等再滚动 */
export function openSuggestionTarget(
  target: EntityLocation | null | undefined,
  suggestionId?: string
) {
  if (!target) {
    toast.info("原正文已不存在");
    return;
  }
  try {
    if (target.kind === "card") openPage("card-detail", { id: target.id });
    else if (target.kind === "article") openPage("article-detail", { id: target.id });
    else if (target.kind === "project_item" && target.projectId != null)
      openPage("project-detail", { id: target.projectId, itemId: target.id });
    else {
      toast.info("这类正文暂不支持在此打开");
      return;
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "无法打开正文");
    return;
  }
  if (!suggestionId) {
    useSuggestionFocus.getState().clear();
    return;
  }
  focusSuggestionInDocument(suggestionId);
}
