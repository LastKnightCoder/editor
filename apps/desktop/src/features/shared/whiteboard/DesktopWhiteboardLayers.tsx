import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { ConfirmDialog, Drawer, toast, useRetainedValue } from "@tau/ui";
import { useBoard } from "@tau/whiteboard";
import { BoardUtil, PathUtil } from "@tau/whiteboard";
import type {
  BoardElement,
  ContextMenuModalPayload,
  MindNodeElement,
  VideoElement,
} from "@tau/whiteboard";
import NotePanel from "./components/NotePanel";
import { DocumentSelectorModal } from "./components/Document/DocumentSelectorModal";
import ImageSelectorModal from "./components/ImageSelectorModal";
import WebviewSelectorModal from "./components/WebviewSelectorModal";
import WhiteBoardSelectorModal from "./components/WhiteBoardSelectorModal";
import VideoSelectorModal from "./components/VideoSelectorModal";
import AudioSelectorModal from "./components/AudioSelectorModal";

import EditTitleModal from "@/components/EditTitleModal";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import {
  createContent as baseCreateContent,
  updateContent as baseUpdateContent,
  decrementContentRefCount as baseDecrementContentRefCount,
  incrementContentRefCount as baseIncrementContentRefCount,
} from "@/commands/content";
import {
  createEmptyVideoNote as baseCreateEmptyVideoNote,
  getVideoNoteById as baseGetVideoNoteById,
} from "@/commands";
import {
  buildCardFromContent as baseBuildCardFromContent,
  getCardByContentId as baseGetCardByContentId,
} from "@/commands/card";
import {
  buildArticleFromContent as baseBuildArticleFromContent,
  getArticleByContentId as baseGetArticleByContentId,
} from "@/commands/article";
import { getContentLength } from "@/utils";
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

export function DesktopWhiteboardLayers() {
  const board = useBoard();
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const {
    createContent,
    updateContent,
    decrementContentRefCount,
    incrementContentRefCount,
    createEmptyVideoNote,
    getVideoNoteById,
    buildCardFromContent,
    getCardByContentId,
    buildArticleFromContent,
    getArticleByContentId,
  } = useMemo(
    () =>
      bindDatabaseCommands(
        {
          createContent: baseCreateContent,
          updateContent: baseUpdateContent,
          decrementContentRefCount: baseDecrementContentRefCount,
          incrementContentRefCount: baseIncrementContentRefCount,
          createEmptyVideoNote: baseCreateEmptyVideoNote,
          getVideoNoteById: baseGetVideoNoteById,
          buildCardFromContent: baseBuildCardFromContent,
          getCardByContentId: baseGetCardByContentId,
          buildArticleFromContent: baseBuildArticleFromContent,
          getArticleByContentId: baseGetArticleByContentId,
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
  const [pendingRichTextCreateTarget, setPendingRichTextCreateTarget] = useState<{
    elementId: string;
    mode: "project";
    contentId: number;
    title: string;
  } | null>(null);
  const [pendingRichTextTitlePrompt, setPendingRichTextTitlePrompt] = useState<{
    elementId: string;
    mode: "project";
    contentId: number;
  } | null>(null);
  const richTextLinkCheckRef = useRef(
    new Map<
      string,
      {
        contentId: number;
        cardChecked: boolean;
        articleChecked: boolean;
      }
    >()
  );
  // 取消关联笔记的二次确认（ConfirmDialog；原 antd modal.confirm）
  const [unlinkNodeId, setUnlinkNodeId] = useState<string | null>(null);

  const [contextMenuModal, setContextMenuModal] = useState<ContextMenuModalPayload | null>(null);
  // 监听右键菜单弹窗事件
  useEffect(() => {
    const handleOpenModal = (payload: ContextMenuModalPayload) => {
      setContextMenuModal(payload);
    };
    board.on("context-menu:open-modal", handleOpenModal);
    return () => {
      board.off("context-menu:open-modal", handleOpenModal);
    };
  }, [board]);

  const ensureRichTextContentId = useMemoizedFn(async (elementId: string) => {
    const canSubmit = board.captureSubmission();
    const latestElement = BoardUtil.getElementById(board, elementId) as
      | (BoardElement & {
          content?: any[];
          contentId?: number;
        })
      | null;

    if (!latestElement || latestElement.type !== "richtext") {
      throw new Error("未找到富文本元素");
    }

    if (latestElement.contentId) {
      return {
        contentId: latestElement.contentId,
        content: latestElement.content || [],
      };
    }

    const currentContent = latestElement.content || [];
    const newContentId = await createContent(currentContent, getContentLength(currentContent));
    if (!newContentId) {
      throw new Error("创建共享内容失败");
    }

    if (!canSubmit()) throw new Error("白板操作已取消");
    await updateContent(newContentId, currentContent);
    if (!canSubmit()) throw new Error("白板操作已取消");

    const path = PathUtil.getPathByElement(board, latestElement);
    if (path) {
      const newElement = {
        ...latestElement,
        contentId: newContentId,
        content: currentContent,
      };
      const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
      if (ops.length > 0) {
        board.apply(ops);
      }
    }

    return {
      contentId: newContentId,
      content: currentContent,
    };
  });

  useEffect(() => {
    const handleRichTextCreateAs = async (payload: {
      elementId: string;
      mode: "card" | "article" | "project";
    }) => {
      try {
        const canSubmit = board.captureSubmission();
        const { contentId } = await ensureRichTextContentId(payload.elementId);
        if (!canSubmit()) return;
        const latestElement = BoardUtil.getElementById(board, payload.elementId) as
          | (BoardElement & {
              linkedCardId?: number;
              linkedArticleId?: number;
            })
          | null;
        if (payload.mode === "card") {
          const card = await buildCardFromContent(contentId);
          if (!canSubmit()) return;
          if (latestElement) {
            const path = PathUtil.getPathByElement(board, latestElement);
            if (path) {
              const newElement = {
                ...latestElement,
                linkedCardId: card.id,
              };
              const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
              if (ops.length > 0) {
                board.apply(ops);
              }
            }
          }
          toast.success("创建卡片成功");
          return;
        }
        if (payload.mode === "article") {
          const article = await buildArticleFromContent(contentId);
          if (!canSubmit()) return;
          if (latestElement) {
            const path = PathUtil.getPathByElement(board, latestElement);
            if (path) {
              const newElement = {
                ...latestElement,
                linkedArticleId: article.id,
              };
              const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
              if (ops.length > 0) {
                board.apply(ops);
              }
            }
          }
          toast.success("创建文章成功");
          return;
        }
        setPendingRichTextTitlePrompt({
          elementId: payload.elementId,
          mode: payload.mode,
          contentId,
        });
      } catch (error) {
        console.error("Failed to create content from rich text:", error);
        toast.error("创建失败");
      }
    };

    board.on("richtext:create-as", handleRichTextCreateAs);
    return () => {
      board.off("richtext:create-as", handleRichTextCreateAs);
    };
  }, [board, ensureRichTextContentId]);

  const { children } = useSyncExternalStore(board.subscribe, board.getSnapshot);
  useEffect(() => {
    const currentElementIds = new Set(children.map(child => child.id));
    for (const elementId of richTextLinkCheckRef.current.keys()) {
      if (!currentElementIds.has(elementId)) {
        richTextLinkCheckRef.current.delete(elementId);
      }
    }

    children.forEach(child => {
      if (child.type !== "richtext" || !child.contentId) {
        return;
      }

      const cached = richTextLinkCheckRef.current.get(child.id);
      const record =
        cached && cached.contentId === child.contentId
          ? cached
          : {
              contentId: child.contentId,
              cardChecked: false,
              articleChecked: false,
            };

      if (record !== cached) {
        richTextLinkCheckRef.current.set(child.id, record);
      }

      if (child.linkedCardId) {
        record.cardChecked = true;
      }
      if (child.linkedArticleId) {
        record.articleChecked = true;
      }

      if (!child.linkedCardId && !record.cardChecked) {
        record.cardChecked = true;
        getCardByContentId(child.contentId)
          .then(card => {
            if (board.isDestroyed || board.readonly) return;
            if (!card) return;
            const latestElement = BoardUtil.getElementById(board, child.id) as
              | (BoardElement & {
                  contentId?: number;
                  linkedCardId?: number;
                })
              | null;
            if (
              !latestElement ||
              latestElement.type !== "richtext" ||
              latestElement.contentId !== child.contentId ||
              latestElement.linkedCardId
            ) {
              return;
            }

            const path = PathUtil.getPathByElement(board, latestElement);
            if (!path) return;
            const newElement = {
              ...latestElement,
              linkedCardId: card.id,
            };
            const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
            if (ops.length > 0) {
              board.apply(ops);
            }
          })
          .catch(error => {
            console.error("Failed to hydrate rich text card link:", error);
          });
      }

      if (!child.linkedArticleId && !record.articleChecked) {
        record.articleChecked = true;
        getArticleByContentId(child.contentId)
          .then(article => {
            if (board.isDestroyed || board.readonly) return;
            if (!article) return;
            const latestElement = BoardUtil.getElementById(board, child.id) as
              | (BoardElement & {
                  contentId?: number;
                  linkedArticleId?: number;
                })
              | null;
            if (
              !latestElement ||
              latestElement.type !== "richtext" ||
              latestElement.contentId !== child.contentId ||
              latestElement.linkedArticleId
            ) {
              return;
            }

            const path = PathUtil.getPathByElement(board, latestElement);
            if (!path) return;
            const newElement = {
              ...latestElement,
              linkedArticleId: article.id,
            };
            const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
            if (ops.length > 0) {
              board.apply(ops);
            }
          })
          .catch(error => {
            console.error("Failed to hydrate rich text article link:", error);
          });
      }
    });
  }, [board, children]);

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
      {/* 右键菜单触发的弹窗 */}
      <DocumentSelectorModal
        open={contextMenuModal?.type === "document"}
        onClose={() => setContextMenuModal(null)}
        board={board}
      />
      <ImageSelectorModal
        open={contextMenuModal?.type === "image"}
        onClose={() => setContextMenuModal(null)}
        board={board}
        action={contextMenuModal?.action}
      />
      <WebviewSelectorModal
        open={contextMenuModal?.type === "webview"}
        onClose={() => setContextMenuModal(null)}
        board={board}
      />
      <WhiteBoardSelectorModal
        open={contextMenuModal?.type === "whiteboard"}
        onClose={() => setContextMenuModal(null)}
        board={board}
        action={
          contextMenuModal?.action === "reference" || contextMenuModal?.action === "create"
            ? (contextMenuModal?.action as "reference" | "create")
            : undefined
        }
      />
      <VideoSelectorModal
        open={contextMenuModal?.type === "video"}
        onClose={() => setContextMenuModal(null)}
        board={board}
        action={contextMenuModal?.action}
      />
      <AudioSelectorModal
        open={contextMenuModal?.type === "audio"}
        onClose={() => setContextMenuModal(null)}
        board={board}
        action={contextMenuModal?.action}
      />
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
      <EditTitleModal
        open={pendingRichTextTitlePrompt !== null}
        onCancel={() => setPendingRichTextTitlePrompt(null)}
        onConfirm={({ title }) => {
          if (!pendingRichTextTitlePrompt) return;
          setPendingRichTextCreateTarget({
            ...pendingRichTextTitlePrompt,
            title,
          });
          setPendingRichTextTitlePrompt(null);
        }}
        initialTitle=""
        modalTitle="创建项目文档"
        modalDescription="请输入标题后再选择插入位置"
        placeholder="请输入标题"
      />
      <InsertNoteToTreeModal
        mode={pendingRichTextCreateTarget?.mode || "project"}
        open={pendingRichTextCreateTarget !== null}
        noteTitle={pendingRichTextCreateTarget?.title || ""}
        noteContent={
          pendingRichTextCreateTarget
            ? (
                BoardUtil.getElementById(
                  board,
                  pendingRichTextCreateTarget.elementId
                ) as BoardElement & {
                  content?: any[];
                }
              )?.content || []
            : []
        }
        sourceContentId={pendingRichTextCreateTarget?.contentId || null}
        insertMode="shared-content"
        onCancel={() => setPendingRichTextCreateTarget(null)}
        onSuccess={() => {
          setPendingRichTextCreateTarget(null);
          toast.success("创建成功");
        }}
      />
    </>
  );
}
