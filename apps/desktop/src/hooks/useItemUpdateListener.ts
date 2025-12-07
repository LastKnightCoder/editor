import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";
import {
  getCardById,
  findOneArticle,
  getProjectItemById,
  getDocumentItem,
  getContentById,
} from "@/commands";
import {
  defaultCardEventBus,
  defaultArticleEventBus,
  defaultProjectItemEventBus,
  defaultDocumentItemEventBus,
  defaultContentEventBus,
} from "@/utils";
import { on, off } from "@/electron";
import { useCreation } from "ahooks";

export const useItemUpdateListener = () => {
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );
  const contentEventBus = useCreation(
    () => defaultContentEventBus.createEditor(),
    [],
  );

  useEffect(() => {
    const handleCardUpdated = async (
      _e: any,
      data: { cardId: number; databaseName: string },
    ) => {
      const currentDatabaseName =
        useSettingStore.getState().setting.database.active;
      if (
        data.databaseName.replace(".db", "") !==
        currentDatabaseName.replace(".db", "")
      )
        return;
      const card = await getCardById(data.cardId);
      cardEventBus.publishCardEvent("card:updated", card);
    };

    const handleArticleUpdated = async (
      _e: any,
      data: { articleId: number; databaseName: string },
    ) => {
      const currentDatabaseName =
        useSettingStore.getState().setting.database.active;
      if (
        data.databaseName.replace(".db", "") !==
        currentDatabaseName.replace(".db", "")
      )
        return;
      const article = await findOneArticle(data.articleId);
      articleEventBus.publishArticleEvent("article:updated", article);
    };

    const handleProjectItemUpdated = async (
      _e: any,
      data: { projectItemId: number; databaseName: string },
    ) => {
      const currentDatabaseName =
        useSettingStore.getState().setting.database.active;
      if (
        data.databaseName.replace(".db", "") !==
        currentDatabaseName.replace(".db", "")
      )
        return;
      const projectItem = await getProjectItemById(data.projectItemId);
      if (!projectItem) return;
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        projectItem,
      );
    };

    const handleDocumentItemUpdated = async (
      _e: any,
      data: { documentItemId: number; databaseName: string },
    ) => {
      const currentDatabaseName =
        useSettingStore.getState().setting.database.active;
      if (
        data.databaseName.replace(".db", "") !==
        currentDatabaseName.replace(".db", "")
      )
        return;
      const documentItem = await getDocumentItem(data.documentItemId);
      if (!documentItem) return;
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        documentItem,
      );
    };

    const handleContentUpdated = async (
      _e: any,
      data: { contentId: number; databaseName: string },
    ) => {
      const currentDatabaseName =
        useSettingStore.getState().setting.database.active;
      if (
        data.databaseName.replace(".db", "") !==
        currentDatabaseName.replace(".db", "")
      )
        return;
      const content = await getContentById(data.contentId);
      if (!content) return;
      contentEventBus.publishContentEvent("content:updated", content);
    };

    on("card:updated", handleCardUpdated);
    on("article:updated", handleArticleUpdated);
    on("project-item:updated", handleProjectItemUpdated);
    on("document-item:updated", handleDocumentItemUpdated);
    on("content:updated", handleContentUpdated);
    return () => {
      off("card:updated", handleCardUpdated);
      off("article:updated", handleArticleUpdated);
      off("project-item:updated", handleProjectItemUpdated);
      off("document-item:updated", handleDocumentItemUpdated);
      off("content:updated", handleContentUpdated);
    };
  }, [
    cardEventBus,
    articleEventBus,
    projectItemEventBus,
    documentItemEventBus,
    contentEventBus,
  ]);
};
