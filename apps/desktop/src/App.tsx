import { useState, useEffect, useMemo } from "react";
import { App, ConfigProvider, theme, message as antdMessage } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorProvider } from "@tau/editor/src";
import { createEditorRegistry } from "@/services/editorRegistry";
import { useDesktopEditorConfig } from "@/services/useDesktopEditorConfig";
import { createDesktopEditorExtensions } from "@/editor-extensions";
import {
  BilibiliVideoDepsProvider,
  YoutubeVideoDepsProvider,
  EditDatabaseDepsProvider,
  RemoteVideoDepsProvider,
  type UseBilibiliVideoDeps,
  type UseYoutubeVideoDeps,
  type UseEditDatabaseDeps,
  type UseRemoteVideoDeps,
} from "@tau/shared";

import useTheme from "@/hooks/useTheme.ts";
import useSyncFont from "@/hooks/useSyncFont.ts";
import useSyncTheme from "@/hooks/useSyncTheme";
import useSyncTwoToneColor from "@/hooks/useSyncTwoToneColor";
import useSearchWarmUp from "@/hooks/useSearchWarmUp";
import { useItemUpdateListener } from "@/hooks/useItemUpdateListener";
import useSyncSetting from "@/hooks/useSyncSetting";
import useWeReadSessionBootstrap from "@/hooks/useWeReadSessionBootstrap";
import { useInitChatData } from "@/hooks/useInitChatData";
import { WindowFocusContext } from "@/hooks/useWindowFocus";
import useAntdThemeToken from "@/hooks/useAntdThemeToken";
import AutoSyncManager from "@/components/AutoSyncManager";
import { MediaModalHost } from "@/editor-providers/mediaModalHost";
import ConversationFlashcardModal from "@/components/ConversationFlashcardModal";
import ExtNoteInsertModal from "@/components/ExtNoteInsertModal";
import MCPManagerModal from "@/components/MCPManagerModal";
import GlobalFindBar from "@/components/GlobalFindBar";
import JoinRequestNotifications from "@/components/JoinRequestNotifications";
import useSettingStore from "@/stores/useSettingStore";
import useMCPManagerModalStore from "@/stores/useMCPManagerModalStore";

import { on, off } from "@/electron";
import { getPlayUrl, checkStreamAvailability } from "@/utils/bilibili";
import { bilibiliVideoToLocal, isBilibiliVideoCached } from "@/utils/bilibili-cache";
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
  onPythonRuntimeProgress,
  retryPythonRuntimeDownload,
} from "@/commands";
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
  useSearchWarmUp();
  useInitChatData(); // 全局初始化聊天数据
  useWeReadSessionBootstrap();

  const [isFocused, setIsFocused] = useState(true);
  const isMcpManagerOpen = useMCPManagerModalStore(state => state.isOpen);
  const closeMcpManagerModal = useMCPManagerModalStore(state => state.closeModal);

  const editorRegistry = useMemo(() => createEditorRegistry(), []);
  const editorExtensions = useMemo(() => createDesktopEditorExtensions(), []);
  const editorConfig = useDesktopEditorConfig();

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
      checkStreamAvailability: async urls => {
        const playUrl = { video: urls.video, audio: urls.audio, quality: 0 };
        return await checkStreamAvailability(playUrl);
      },
      cacheVideo: bilibiliVideoToLocal,
      getCacheStatus: isBilibiliVideoCached,
      showError: msg => antdMessage.error(msg),
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
      getCacheStatus: async url => {
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
      showError: msg => antdMessage.error(msg),
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
            ? progress => {
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
      getCacheStatus: async url => {
        const status = await getRemoteVideoCacheStatus(url);
        if (!status) return null;
        return {
          cached: status.cached,
          localPath: status.localPath,
          fileSize: status.fileSize,
        };
      },
      showError: msg => antdMessage.error(msg),
      isRemoteUrl: url => url.startsWith("http://") || url.startsWith("https://"),
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

  useEffect(() => {
    const handleVideoNoteDeleted = ({ videoNoteId }: { videoNoteId?: number }) => {
      if (!videoNoteId) {
        return;
      }
      try {
        localStorage.removeItem(`video_note_subtitle_mounted_${videoNoteId}`);
      } catch (error) {
        console.warn("清理视频字幕挂载状态失败:", error);
      }
    };

    on("video-note:deleted", handleVideoNoteDeleted);
    return () => {
      off("video-note:deleted", handleVideoNoteDeleted);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onPythonRuntimeProgress(progress => {
      if (progress.trigger !== "foreground") {
        return;
      }

      if (progress.state === "downloading") {
        antdMessage.open({
          key: "python-runtime-progress",
          type: "loading",
          content: progress.message || `正在准备 Python 服务... ${progress.progress}%`,
          duration: 0,
        });
        return;
      }

      if (progress.state === "checking") {
        antdMessage.open({
          key: "python-runtime-progress",
          type: "loading",
          content: progress.message || "正在检查 Python 服务版本...",
          duration: 0,
        });
        return;
      }

      if (progress.state === "ready") {
        antdMessage.destroy("python-runtime-progress");
        return;
      }

      if (progress.state === "degraded") {
        antdMessage.open({
          key: "python-runtime-progress",
          type: "warning",
          content: progress.message || "Python 服务更新失败，继续使用本地版本",
          duration: 3,
        });
        return;
      }

      if (progress.state === "error") {
        antdMessage.open({
          key: "python-runtime-progress",
          type: "error",
          content: (
            <span>
              {progress.message || "Python 服务准备失败"}
              <a
                style={{ marginLeft: 8 }}
                onClick={() => {
                  void retryPythonRuntimeDownload();
                }}
              >
                重试
              </a>
            </span>
          ),
          duration: 5,
        });
      }
    });

    return () => {
      unsubscribe();
      antdMessage.destroy("python-runtime-progress");
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
                ? "#2a2a2a"
                : "#fafafa"
              : isDark
                ? "rgba(255, 255, 255, 0.06)"
                : "rgba(0, 0, 0, 0.03)",
            rowSelectedBg: isSolid
              ? isDark
                ? "#1a1a1a"
                : "#e6f4ff"
              : isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.04)",
            rowSelectedHoverBg: isSolid
              ? isDark
                ? "#1a1a1a"
                : "#e6f4ff"
              : isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.04)",
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
            colorBgElevated: isDark ? "rgba(24, 24, 27, 0.92)" : "rgba(248, 250, 255, 0.92)",
            colorBorder: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.45)",
            colorSplit: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.45)",
            colorText: isDark ? "rgba(244, 244, 245, 0.95)" : "rgba(15, 23, 42, 0.95)",
            colorTextDescription: isDark ? "rgba(161, 161, 170, 0.7)" : "rgba(100, 116, 139, 0.7)",
            boxShadowSecondary: isDark
              ? "0 22px 60px rgba(0, 0, 0, 0.65)"
              : "0 18px 45px rgba(15, 23, 42, 0.25)",
            controlItemBgHover: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.6)",
            controlItemBgActive: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.6)",
            controlItemBgActiveHover: isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(255, 255, 255, 0.6)",
          },
          Popover: {
            colorBgElevated: isDark ? "rgba(24, 24, 27, 0.92)" : "rgba(248, 250, 255, 0.92)",
            colorText: isDark ? "rgba(244, 244, 245, 0.95)" : "rgba(15, 23, 42, 0.95)",
            colorTextDescription: isDark ? "rgba(161, 161, 170, 0.7)" : "rgba(100, 116, 139, 0.7)",
            colorTextHeading: isDark ? "rgba(244, 244, 245, 0.95)" : "rgba(15, 23, 42, 0.95)",
            colorSplit: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.45)",
            boxShadowSecondary: isDark
              ? "0 22px 60px rgba(0, 0, 0, 0.65)"
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
            <RemoteVideoDepsProvider deps={remoteVideoDeps}>
              <EditDatabaseDepsProvider deps={editDatabaseDeps}>
                <EditorProvider
                  registry={editorRegistry}
                  config={editorConfig}
                  extensions={editorExtensions}
                >
                  <App
                    style={{
                      height: "100%",
                      fontSize: "var(--font-size)",
                      color: "var(--th-text)",
                    }}
                  >
                    <AutoSyncManager />
                    <MediaModalHost />
                    <ConversationFlashcardModal />
                    <ExtNoteInsertModal />
                    <MCPManagerModal open={isMcpManagerOpen} onClose={closeMcpManagerModal} />
                    <DndProvider backend={HTML5Backend}>
                      <GlobalFindBar />
                      <JoinRequestNotifications />
                      <RouterProvider router={router} />
                    </DndProvider>
                  </App>
                </EditorProvider>
              </EditDatabaseDepsProvider>
            </RemoteVideoDepsProvider>
          </YoutubeVideoDepsProvider>
        </BilibiliVideoDepsProvider>
      </WindowFocusContext.Provider>
    </ConfigProvider>
  );
};

export default Application;
