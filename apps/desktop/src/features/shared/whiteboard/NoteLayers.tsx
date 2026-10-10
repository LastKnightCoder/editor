import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { ConfirmDialog, Drawer, toast, useRetainedValue } from "@tau/ui";
import {
  useBoard,
  BoardUtil,
  PathUtil,
  type BoardElement,
  type MindNodeElement,
  type VideoElement,
} from "@tau/whiteboard";
import NotePanel from "./components/NotePanel";
import {
  decrementContentRefCount as baseDecrementContentRefCount,
  incrementContentRefCount as baseIncrementContentRefCount,
} from "@/commands/content";
import {
  createEmptyVideoNote as baseCreateEmptyVideoNote,
  getVideoNoteById as baseGetVideoNoteById,
} from "@/commands";
import VideoNotePanel from "@/components/VideoNotePanel/VideoNotePanel";
import type { VideoMetaInfo } from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands } from "@/services/command-context";
import { unlinkMindNote } from "./unlinkMindNote";

const isRemoteHttpUrl = (src: string) => {
  if (!/^https?:\/\//i.test(src)) {
    return false;
  }
  return !/^https?:\/\/localhost/i.test(src);
};

const getVideoNoteMetaInfo = (element: VideoElement): VideoMetaInfo => {
  if (element.metaInfo?.type === "local") {
    return {
      type: "local",
      filePath: element.metaInfo.filePath || element.src,
    };
  }

  if (element.metaInfo) {
    return element.metaInfo;
  }

  if (isRemoteHttpUrl(element.src)) {
    return {
      type: "remote",
      url: element.src,
    };
  }

  return {
    type: "local",
    filePath: element.src,
  };
};

export function NoteLayers() {
  const board = useBoard();
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const {
    decrementContentRefCount,
    incrementContentRefCount,
    createEmptyVideoNote,
    getVideoNoteById,
  } = useMemo(
    () =>
      bindDatabaseCommands(
        {
          decrementContentRefCount: baseDecrementContentRefCount,
          incrementContentRefCount: baseIncrementContentRefCount,
          createEmptyVideoNote: baseCreateEmptyVideoNote,
          getVideoNoteById: baseGetVideoNoteById,
        },
        { databaseName }
      ),
    [databaseName]
  );

  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [activeNoteTitle, setActiveNoteTitle] = useState<string | null>(null);
  const [activeVideoNote, setActiveVideoNote] = useState<{
    videoNoteId: number;
    elementId: string;
  } | null>(null);
  const [activeVideoElement, setActiveVideoElement] = useState<HTMLVideoElement | null>(null);
  // 视频笔记抽屉退场期间保留最后一条，内容不在滑出途中消失
  const shownVideoNote = useRetainedValue(activeVideoNote);
  const videoElementRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const creatingVideoNoteRefs = useRef<Map<string, Promise<number | null>>>(new Map());
  const activeNoteIdRef = useRef<number | null>(null);
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);
  const [videoNotePanelWidth, setVideoNotePanelWidth] = useLocalStorageState<number>(
    "whiteboard-video-note-panel-width",
    {
      defaultValue: 420,
    }
  );
  // 取消关联笔记的二次确认（ConfirmDialog；原 antd modal.confirm）
  const [unlinkNodeId, setUnlinkNodeId] = useState<string | null>(null);

  // 监听打开笔记事件（入口在元素树右键与思维导图属性条 / 右键菜单，只开不关，关闭走抽屉自身）
  useEffect(() => {
    const handleOpenNote = (contentId: number, contentTitle: string) => {
      setActiveNoteId(contentId);
      setActiveVideoNote(null);
      setActiveNoteTitle(contentTitle);
    };
    board.on("open-note", handleOpenNote);
    return () => {
      board.off("open-note", handleOpenNote);
    };
  }, [board]);

  useEffect(() => {
    const handleOpenVideoNote = async (element: VideoElement) => {
      const canSubmit = board.captureSubmission(element);
      try {
        const latestElement = BoardUtil.getElementById(board, element.id) as VideoElement | null;
        const targetElement = latestElement ?? element;
        let videoNoteId = targetElement.videoNoteId;

        if (videoNoteId) {
          const existing = await getVideoNoteById(videoNoteId);
          if (!existing) {
            videoNoteId = undefined;
          }
        }

        if (!videoNoteId) {
          let creating = creatingVideoNoteRefs.current.get(element.id);
          if (!creating) {
            creating = (async () => {
              const currentBeforeCreate = BoardUtil.getElementById(
                board,
                element.id
              ) as VideoElement | null;
              const currentVideoNoteId = currentBeforeCreate?.videoNoteId;
              if (currentVideoNoteId) {
                const existing = await getVideoNoteById(currentVideoNoteId);
                if (existing) {
                  return currentVideoNoteId;
                }
              }

              const created = await createEmptyVideoNote(
                getVideoNoteMetaInfo(currentBeforeCreate ?? targetElement)
              );
              if (!created) {
                return null;
              }

              const currentElement = BoardUtil.getElementById(
                board,
                element.id
              ) as VideoElement | null;
              const currentAfterCreateVideoNoteId = currentElement?.videoNoteId;
              if (currentAfterCreateVideoNoteId) {
                const existing = await getVideoNoteById(currentAfterCreateVideoNoteId);
                if (existing) {
                  return currentAfterCreateVideoNoteId;
                }
              }

              if (!canSubmit()) return null;
              const path = currentElement && PathUtil.getPathByElement(board, currentElement);
              if (path) {
                board.apply({
                  type: "set_node",
                  path,
                  properties: {
                    videoNoteId: currentElement.videoNoteId,
                  },
                  newProperties: {
                    videoNoteId: created.id,
                  },
                });
              }

              return created.id;
            })().finally(() => {
              creatingVideoNoteRefs.current.delete(element.id);
            });
            creatingVideoNoteRefs.current.set(element.id, creating);
          }

          const createdVideoNoteId = await creating;
          if (!createdVideoNoteId) {
            toast.error("创建视频笔记失败");
            return;
          }
          videoNoteId = createdVideoNoteId;
        }

        if (board.isDestroyed || !canSubmit()) return;
        setActiveNoteId(null);
        setActiveNoteTitle(null);
        setActiveVideoNote({
          videoNoteId,
          elementId: element.id,
        });
        setActiveVideoElement(videoElementRefs.current.get(element.id) ?? null);
      } catch (error) {
        console.error("Open whiteboard video note failed:", error);
        toast.error("打开视频笔记失败");
      }
    };

    const handleElementRemove = (removedElements: BoardElement[]) => {
      removedElements.forEach(element => {
        videoElementRefs.current.delete(element.id);
      });
      setActiveVideoNote(current => {
        if (current && removedElements.some(element => element.id === current.elementId)) {
          setActiveVideoElement(null);
          return null;
        }
        return current;
      });
    };

    const handleVideoElementRef = (payload: {
      elementId: string;
      video: HTMLVideoElement | null;
    }) => {
      if (payload.video) {
        videoElementRefs.current.set(payload.elementId, payload.video);
      } else {
        videoElementRefs.current.delete(payload.elementId);
      }
      setActiveVideoNote(current => {
        if (current?.elementId === payload.elementId) {
          setActiveVideoElement(payload.video);
        }
        return current;
      });
    };

    board.on("video-note:open", handleOpenVideoNote);
    board.on("element:remove", handleElementRemove);
    board.on("video-note:element-ref", handleVideoElementRef);
    return () => {
      board.off("video-note:open", handleOpenVideoNote);
      board.off("element:remove", handleElementRemove);
      board.off("video-note:element-ref", handleVideoElementRef);
    };
  }, [board]);

  // 监听取消关联笔记的二次确认
  useEffect(() => {
    const handleConfirmUnlinkNote = (nodeId: string) => {
      const node = BoardUtil.getElementById(board, nodeId) as MindNodeElement | null;
      if (!node?.contentId) return;
      setUnlinkNodeId(nodeId);
    };
    board.on("mind:confirm-unlink-note", handleConfirmUnlinkNote);
    return () => {
      board.off("mind:confirm-unlink-note", handleConfirmUnlinkNote);
    };
  }, [board]);

  const confirmUnlinkNote = useMemoizedFn(async () => {
    const elementId = unlinkNodeId;
    setUnlinkNodeId(null);
    if (!elementId) return;
    const unlinkContentId = await unlinkMindNote(board, elementId, {
      decrementContentRefCount,
      incrementContentRefCount,
    });
    if (unlinkContentId === null) return;
    // 若侧边栏正打开该笔记，则一并关闭
    if (activeNoteIdRef.current === unlinkContentId) {
      setActiveNoteId(null);
      setActiveNoteTitle(null);
    }
  });

  return (
    <>
      {" "}
      <NotePanel
        contentId={activeNoteId}
        contentTitle={activeNoteTitle ?? undefined}
        onClose={() => setActiveNoteId(null)}
      />
      <Drawer
        modal={false}
        open={activeVideoNote != null}
        onOpenChange={open => {
          if (open) return;
          setActiveVideoNote(null);
          setActiveVideoElement(null);
        }}
        label="视频笔记"
        closeLabel="关闭视频笔记"
        width={videoNotePanelWidth || 420}
        onWidthChange={setVideoNotePanelWidth}
        minWidth={320}
        maxWidth={720}
        fill
        isolateKeyboard
        className="z-50 overflow-hidden"
      >
        {shownVideoNote && (
          <VideoNotePanel
            videoNoteId={shownVideoNote.videoNoteId}
            externalVideoElement={activeVideoElement}
            reserveCloseButtonSpace
          />
        )}
      </Drawer>
      <ConfirmDialog
        open={unlinkNodeId !== null}
        onOpenChange={open => !open && setUnlinkNodeId(null)}
        danger
        title="取消关联笔记？"
        description="笔记内容不会被删除，之后可以重新关联。"
        confirmText="取消关联"
        cancelText="再想想"
        onConfirm={confirmUnlinkNote}
      />
    </>
  );
}
