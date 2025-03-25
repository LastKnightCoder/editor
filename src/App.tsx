import { useEffect } from "react";
import { App, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import useSettingStore from "@/stores/useSettingStore";
import useTheme from "@/hooks/useTheme.ts";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";
import { router } from "@/router.tsx";
import {
  saveSetting,
  getCardById,
  findOneArticle,
  getProjectItemById,
  getDocumentItem,
} from "./commands";
import { useCreation } from "ahooks";
import {
  defaultCardEventBus,
  defaultArticleEventBus,
  defaultProjectItemEventBus,
  defaultDocumentItemEventBus,
} from "@/utils";
import { on, off } from "@/electron";

const Application = () => {
  const { isDark } = useTheme();
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

  const { initSetting, setting, inited } = useSettingStore((state) => ({
    initSetting: state.initSetting,
    setting: state.setting,
    inited: state.inited,
  }));

  useEffect(() => {
    initSetting();
  }, [initSetting]);

  useEffect(() => {
    if (!inited) return;
    saveSetting(JSON.stringify(setting, null, 2)).then();
  }, [inited, setting]);

  useSyncFont();
  useSyncTheme();

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
      if (data.databaseName !== currentDatabaseName) return;
      const article = await findOneArticle(data.articleId);
      articleEventBus.publishArticleEvent("article:updated", article);
    };

    const handleProjectItemUpdated = async (
      _e: any,
      data: { projectItemId: number; databaseName: string },
    ) => {
      const currentDatabaseName =
        useSettingStore.getState().setting.database.active;
      if (data.databaseName !== currentDatabaseName) return;
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
      if (data.databaseName !== currentDatabaseName) return;
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
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          Calendar: {
            fullBg: "transparent",
          },
        },
      }}
      locale={zhCN}
    >
      <App
        style={{
          height: "100%",
          fontSize: "var(--font-size)",
          color: "var(--text-normal)",
        }}
      >
        <DndProvider backend={HTML5Backend}>
          <RouterProvider router={router} />
        </DndProvider>
      </App>
    </ConfigProvider>
  );
};

export default Application;
