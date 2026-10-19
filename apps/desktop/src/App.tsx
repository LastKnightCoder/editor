import { useState, useEffect, useMemo } from "react";
import { toast } from "@tau/ui";
import { RouterProvider } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  EditDatabaseDepsProvider,
  RemoteVideoDepsProvider,
  type UseEditDatabaseDeps,
  type UseRemoteVideoDeps,
} from "@tau/shared";

import useSyncFont from "@/hooks/useSyncFont.ts";
import useSearchWarmUp from "@/hooks/useSearchWarmUp";
import { useItemUpdateListener } from "@/hooks/useItemUpdateListener";
import useArticleDeletedCleanup from "@/hooks/useArticleDeletedCleanup";
import useSyncSetting from "@/hooks/useSyncSetting";
import { useInitChatData } from "@/hooks/useInitChatData";
import { WindowFocusContext } from "@/hooks/useWindowFocus";
import AutoSyncManager from "@/components/AutoSyncManager";
import { MediaModalHost } from "@/editor-providers/mediaModalHost";
import ConversationFlashcardModal from "@/features/flashcards/components/ConversationFlashcardDialog";
import ExtNoteInsertModal from "@/components/ExtNoteInsertModal";
import GlobalFindBar from "@/components/GlobalFindBar";

import { on, off } from "@/electron";
import { platform } from "@/platform";
import {
  convertFileSrc,
  getDataTableDetail,
  updateDataTable,
  updateDataTableChanges,
  updateDataTableView,
  createDataTableView,
  deleteDataTableView,
  setActiveDataTableView,
  reorderDataTableViews,
} from "@/commands";
import {
  downloadRemoteVideoWithProgress,
  getRemoteVideoCacheStatus,
} from "@/commands/remote-video-cache";

import { router } from "@/router.tsx";

const Application = () => {
  useSyncSetting();
  useItemUpdateListener();
  useArticleDeletedCleanup();
  useSyncFont();
  useSearchWarmUp();
  useInitChatData(); // 全局初始化聊天数据

  const [isFocused, setIsFocused] = useState(true);

  const editDatabaseDeps: UseEditDatabaseDeps = useMemo(
    () => ({
      getDataTableDetail,
      updateDataTable,
      updateDataTableChanges,
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
      showError: msg => toast.error(msg),
      isRemoteUrl: url => url.startsWith("http://") || url.startsWith("https://"),
    }),
    []
  );

  useEffect(() => {
    return platform.window.onFocusChange(setIsFocused);
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

  return (
    <WindowFocusContext.Provider value={isFocused}>
      <RemoteVideoDepsProvider deps={remoteVideoDeps}>
        <EditDatabaseDepsProvider deps={editDatabaseDeps}>
          <div
            style={{
              height: "100%",
              fontSize: "var(--font-size)",
              color: "var(--tau-ink-1)",
            }}
          >
            <AutoSyncManager />
            <MediaModalHost />
            <ConversationFlashcardModal />
            <ExtNoteInsertModal />
            <DndProvider backend={HTML5Backend}>
              <GlobalFindBar />
              <RouterProvider router={router} />
            </DndProvider>
          </div>
        </EditDatabaseDepsProvider>
      </RemoteVideoDepsProvider>
    </WindowFocusContext.Provider>
  );
};

export default Application;
