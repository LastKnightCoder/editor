import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { getCardById, findOneArticle, getProjectItemById, getContentById } from "@/commands";
import {
  defaultCardEventBus,
  defaultArticleEventBus,
  defaultProjectItemEventBus,
  defaultContentEventBus,
} from "@/utils";
import { currentCommandScope } from "@/services/command-context";
import { on, off } from "@/electron";
import { useCreation } from "ahooks";
import type { IpcRendererEvent } from "electron";

// 辅助窗口也会收到广播，只有已连上同一资料库的窗口才能回读实体。
function receivesUpdate(databaseName: string) {
  const name = databaseName.replace(/\.db$/, "");
  return (
    currentCommandScope()?.databaseName?.replace(/\.db$/, "") === name &&
    useSettingStore.getState().setting.database.active.replace(/\.db$/, "") === name
  );
}

export const useItemUpdateListener = () => {
  const cardEventBus = useCreation(() => defaultCardEventBus.createEditor(), []);
  const articleEventBus = useCreation(() => defaultArticleEventBus.createEditor(), []);
  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);
  const contentEventBus = useCreation(() => defaultContentEventBus.createEditor(), []);

  useEffect(() => {
    const handleCardUpdated = async (
      _e: IpcRendererEvent,
      data: { cardId: number; databaseName: string }
    ) => {
      if (!receivesUpdate(data.databaseName)) return;
      const card = await getCardById(data.cardId);
      cardEventBus.publishCardEvent("card:updated", card);
    };

    const handleArticleUpdated = async (
      _e: IpcRendererEvent,
      data: { articleId: number; databaseName: string }
    ) => {
      if (!receivesUpdate(data.databaseName)) return;
      const article = await findOneArticle(data.articleId);
      if (!article) return;
      articleEventBus.publishArticleEvent("article:updated", article);
    };

    const handleProjectItemUpdated = async (
      _e: IpcRendererEvent,
      data: { projectItemId: number; databaseName: string }
    ) => {
      if (!receivesUpdate(data.databaseName)) return;
      const projectItem = await getProjectItemById(data.projectItemId);
      if (!projectItem) return;
      projectItemEventBus.publishProjectItemEvent("project-item:updated", projectItem);
    };

    const handleContentUpdated = async (
      _e: IpcRendererEvent,
      data: { contentId: number; databaseName: string }
    ) => {
      if (!receivesUpdate(data.databaseName)) return;
      const content = await getContentById(data.contentId);
      if (!content) return;
      contentEventBus.publishContentEvent("content:updated", content);
    };

    on("card:updated", handleCardUpdated);
    on("article:updated", handleArticleUpdated);
    on("project-item:updated", handleProjectItemUpdated);
    on("content:updated", handleContentUpdated);
    return () => {
      off("card:updated", handleCardUpdated);
      off("article:updated", handleArticleUpdated);
      off("project-item:updated", handleProjectItemUpdated);
      off("content:updated", handleContentUpdated);
    };
  }, [cardEventBus, articleEventBus, projectItemEventBus, contentEventBus]);
};
