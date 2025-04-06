import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";
import {
  getCardById,
  findOneArticle,
  getProjectItemById,
  getDocumentItem,
} from "@/commands";
import {
  defaultCardEventBus,
  defaultArticleEventBus,
  defaultProjectItemEventBus,
  defaultDocumentItemEventBus,
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
      console.log("article:updated", data, currentDatabaseName);
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
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        documentItem,
      );
    };

    on("card:updated", handleCardUpdated);
    on("article:updated", handleArticleUpdated);
    on("project-item:updated", handleProjectItemUpdated);
    on("document-item:updated", handleDocumentItemUpdated);
    return () => {
      off("card:updated", handleCardUpdated);
      off("article:updated", handleArticleUpdated);
      off("project-item:updated", handleProjectItemUpdated);
      off("document-item:updated", handleDocumentItemUpdated);
    };
  }, [
    cardEventBus,
    articleEventBus,
    projectItemEventBus,
    documentItemEventBus,
  ]);
};
