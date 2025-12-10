import { useState, useEffect, useMemo } from "react";
import { App, ConfigProvider, theme, message as antdMessage } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorServicesProvider } from "@tau/editor/src";
import {
  BilibiliVideoDepsProvider,
  YoutubeVideoDepsProvider,
  NotionVideoDepsProvider,
  EditDatabaseDepsProvider,
  RemoteVideoDepsProvider,
  type UseBilibiliVideoDeps,
  type UseYoutubeVideoDeps,
  type UseNotionVideoDeps,
  type UseEditDatabaseDeps,
  type UseRemoteVideoDeps,
} from "@tau/shared";

import useTheme from "@/hooks/useTheme.ts";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";
import useSyncTwoToneColor from "@/hooks/useSyncTwoToneColor";
import { useItemUpdateListener } from "@/hooks/useItemUpdateListener";
import useSyncSetting from "@/hooks/useSyncSetting";
import { WindowFocusContext } from "@/hooks/useWindowFocus";
import useAntdThemeToken from "@/hooks/useAntdThemeToken";
import AutoSyncManager from "@/components/AutoSyncManager";
import ConversationFlashcardModal from "@/components/ConversationFlashcardModal";
import { createEditorServices } from "@/services/editorServices";
import useSettingStore from "@/stores/useSettingStore";

import { on, off } from "@/electron";
import {
  getPlayUrl,
  checkStreamAvailability,
} from "@/utils/bilibili";
import {
  bilibiliVideoToLocal,
  isBilibiliVideoCached,
} from "@/utils/bilibili-cache";
import {
  cacheYoutubeVideo,
  getYoutubeCacheStatus,
  convertFileSrc,
  getDataTableDetail,
  updateDataTable,
  updateDataTableView,
  createDataTableView,
  deleteDataTableView,
  setActiveDataTableView,
  reorderDataTableViews,
} from "@/commands";
import { getNotionBlockInfo } from "@/commands/notion";
import {
  cacheNotionVideo,
  getNotionCacheStatus,
} from "@/commands/notion-cache";
import {
  downloadRemoteVideoWithProgress,
  getRemoteVideoCacheStatus,
} from "@/commands/remote-video-cache";

import { router } from "@/router.tsx";

const Application = () => {
  const { isDark } = useTheme();
  const { token, isSolid } = useAntdThemeToken();

  useSyncSetting();
  useItemUpdateListener();
  useSyncFont();
  useSyncTheme();
  useSyncTwoToneColor();

  const [isFocused, setIsFocused] = useState(true);

  const editorServices = useMemo(() => createEditorServices(), []);

  const bilibiliDeps: UseBilibiliVideoDeps = useMemo(
    () => ({
      getCredentials: async () => {
        const { setting } = useSettingStore.getState();
        return {
          SESSDATA: setting.integration.bilibili.credentials.SESSDATA,
          enabled: setting.integration.bilibili.enabled,
        };
      },
      getPlayUrl: (cid, bvid, quality, creds) => getPlayUrl(cid, bvid, quality, creds),
      checkStreamAvailability: async (urls) => {
        const playUrl = { video: urls.video, audio: urls.audio, quality: 0 };
        return await checkStreamAvailability(playUrl);
      },
      cacheVideo: bilibiliVideoToLocal,
      getCacheStatus: isBilibiliVideoCached,
      showError: (msg) => antdMessage.error(msg),
    }),
    []
  );

  const youtubeDeps: UseYoutubeVideoDeps = useMemo(
    () => ({
      getProxy: async () => {
        const { setting } = useSettingStore.getState();
        return {
          proxy: setting.integration.youtube.proxy,
          enabled: setting.integration.youtube.enabled,
        };
      },
      getCacheStatus: async (url) => {
        const status = await getYoutubeCacheStatus(url);
        if (!status) return null;
        return {
          cached: true,
          localPath: status.localPath,
          fileSize: status.fileSize,
        };
      },
      cacheVideo: cacheYoutubeVideo,
      convertFileSrc,
      showError: (msg) => antdMessage.error(msg),
    }),
    []
  );

  const notionDeps: UseNotionVideoDeps = useMemo(
    () => ({
      getToken: async () => {
        const { setting } = useSettingStore.getState();
        return {
          token: setting.integration.notion.token,
          enabled: setting.integration.notion.enabled,
        };
      },
      getBlockInfo: getNotionBlockInfo,
      getCacheStatus: getNotionCacheStatus,
      cacheVideo: cacheNotionVideo,
      showError: (msg) => antdMessage.error(msg),
    }),
    []
  );

  const editDatabaseDeps: UseEditDatabaseDeps = useMemo(
    () => ({
      getDataTableDetail,
      updateDataTable,
      updateDataTableView,
      createDataTableView,
      deleteDataTableView,
      setActiveDataTableView: async (tableId: number, viewId: number | null) => {
        const result = await setActiveDataTableView(tableId, viewId);
        return result !== null;
      },
      reorderDataTableViews,
    }),
    []
  );

  const remoteVideoDeps: UseRemoteVideoDeps = useMemo(
    () => ({
      cacheVideo: async (options, onProgress) => {
        const result = await downloadRemoteVideoWithProgress(
          { url: options.url, fileName: options.fileName },
          onProgress
            ? (progress) => {
                onProgress({
                  progress: progress.progress,
                  stage: progress.stage,
                  message: progress.message,
                  downloaded: progress.downloaded,
                  total: progress.total,
                });
              }
            : undefined
        );
        const localUrl = await convertFileSrc(result.localPath);
        return {
          localUrl,
          fileSize: result.fileSize,
          cached: result.cached,
        };
      },
      getCacheStatus: async (url) => {
        const status = await getRemoteVideoCacheStatus(url);
        if (!status) return null;
        return {
          cached: status.cached,
          localPath: status.localPath,
          fileSize: status.fileSize,
        };
      },
      showError: (msg) => antdMessage.error(msg),
      isRemoteUrl: (url) => url.startsWith("http://") || url.startsWith("https://"),
    }),
    []
  );

  useEffect(() => {
    const handleWindowFocus = () => {
      setIsFocused(true);
    };

    const handleWindowBlur = () => {
      setIsFocused(false);
    };
    on("window-focus", handleWindowFocus);
    on("window-blur", handleWindowBlur);

    return () => {
      off("window-focus", handleWindowFocus);
      off("window-blur", handleWindowBlur);
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token,
        components: {
          Calendar: {
            fullBg: "transparent",
          },
          Table: {
            headerBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#fafafa"
              : isDark
                ? "rgba(0, 0, 0, 0.2)"
                : "rgba(255, 255, 255, 0.6)",
            rowHoverBg: isSolid
              ? isDark
                ? "#262626"
                : "#f5f5f5"
              : isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.02)",
            headerSortActiveBg: isSolid
              ? isDark
                ? "#262626"
                : "#f0f0f0"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(0, 0, 0, 0.04)",
            headerFilterHoverBg: isSolid
              ? isDark
                ? "#333333"
                : "#e5e5e5"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.06)",
          },
          Button: {
            primaryShadow: "none",
            defaultShadow: "none",
            dangerShadow: "none",
            defaultBg: isSolid
              ? isDark
                ? "#262626"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.8)",
            defaultBorderColor: isSolid
              ? isDark
                ? "#424242"
                : "#d9d9d9"
              : isDark
                ? "rgba(255, 255, 255, 0.2)"
                : "rgba(0, 0, 0, 0.15)",
            defaultHoverBg: isSolid
              ? isDark
                ? "#333333"
                : "#f5f5f5"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.9)",
            defaultHoverBorderColor: isSolid
              ? isDark
                ? "#525252"
                : "#b3b3b3"
              : isDark
                ? "rgba(255, 255, 255, 0.3)"
                : "rgba(0, 0, 0, 0.2)",
          },
          Select: {
            optionSelectedBg: isSolid
              ? isDark
                ? "#262626"
                : "#f0f0f0"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(0, 0, 0, 0.04)",
            selectorBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.8)",
            optionActiveBg: isSolid
              ? isDark
                ? "#333333"
                : "#e6e6e6"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.06)",
          },
          Pagination: {
            itemBg: isSolid
              ? "transparent"
              : isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(255, 255, 255, 0.6)",
            itemActiveBg: isSolid
              ? isDark
                ? "#262626"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.9)",
            itemInputBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.8)",
          },
          Input: {
            activeShadow: "none",
            activeBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.9)",
            hoverBg: isSolid
              ? isDark
                ? "#262626"
                : "#ffffff"
              : isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(255, 255, 255, 0.85)",
          },
          Modal: {
            contentBg: isSolid
              ? isDark
                ? "#1f1f1f"
                : "#ffffff"
              : isDark
                ? "rgba(20, 20, 20, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
            headerBg: "transparent",
          },
          Dropdown: {
            colorBgElevated: isDark
              ? "rgba(10, 15, 28, 0.85)"
              : "rgba(248, 250, 255, 0.92)",
            colorBorder: isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(255, 255, 255, 0.45)",
            colorSplit: isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(255, 255, 255, 0.45)",
            colorText: isDark
              ? "rgba(241, 245, 249, 0.95)"
              : "rgba(15, 23, 42, 0.95)",
            colorTextDescription: isDark
              ? "rgba(148, 163, 184, 0.7)"
              : "rgba(100, 116, 139, 0.7)",
            boxShadowSecondary: isDark
              ? "0 22px 60px rgba(2, 6, 23, 0.7)"
              : "0 18px 45px rgba(15, 23, 42, 0.25)",
            controlItemBgHover: isDark
              ? "rgba(148, 163, 184, 0.15)"
              : "rgba(255, 255, 255, 0.6)",
            controlItemBgActive: isDark
              ? "rgba(148, 163, 184, 0.15)"
              : "rgba(255, 255, 255, 0.6)",
            controlItemBgActiveHover: isDark
              ? "rgba(148, 163, 184, 0.15)"
              : "rgba(255, 255, 255, 0.6)",
          },
          Popover: {
            colorBgElevated: isDark
              ? "rgba(10, 15, 28, 0.85)"
              : "rgba(248, 250, 255, 0.92)",
            colorText: isDark
              ? "rgba(241, 245, 249, 0.95)"
              : "rgba(15, 23, 42, 0.95)",
            colorTextDescription: isDark
              ? "rgba(148, 163, 184, 0.7)"
              : "rgba(100, 116, 139, 0.7)",
            colorTextHeading: isDark
              ? "rgba(241, 245, 249, 0.95)"
              : "rgba(15, 23, 42, 0.95)",
            colorSplit: isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(255, 255, 255, 0.45)",
            boxShadowSecondary: isDark
              ? "0 22px 60px rgba(2, 6, 23, 0.7)"
              : "0 18px 45px rgba(15, 23, 42, 0.25)",
          },
          Tooltip: {
            colorBgSpotlight: isDark ? "#1f1f1f" : "#ffffff",
            colorTextLightSolid: isDark ? "#e5e5e5" : "#262626",
          },
        },
      }}
      locale={zhCN}
    >
      <WindowFocusContext.Provider value={isFocused}>
        <BilibiliVideoDepsProvider deps={bilibiliDeps}>
          <YoutubeVideoDepsProvider deps={youtubeDeps}>
            <NotionVideoDepsProvider deps={notionDeps}>
              <RemoteVideoDepsProvider deps={remoteVideoDeps}>
                <EditDatabaseDepsProvider deps={editDatabaseDeps}>
                  <EditorServicesProvider services={editorServices}>
                    <App
                      style={{
                        height: "100%",
                        fontSize: "var(--font-size)",
                        color: "var(--text-normal)",
                      }}
                    >
                      <AutoSyncManager />
                      <ConversationFlashcardModal />
                      <DndProvider backend={HTML5Backend}>
                        <RouterProvider router={router} />
                      </DndProvider>
                    </App>
                  </EditorServicesProvider>
                </EditDatabaseDepsProvider>
              </RemoteVideoDepsProvider>
            </NotionVideoDepsProvider>
          </YoutubeVideoDepsProvider>
        </BilibiliVideoDepsProvider>
      </WindowFocusContext.Provider>
    </ConfigProvider>
  );
};

export default Application;
