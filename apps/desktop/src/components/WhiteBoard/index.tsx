import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useMemoizedFn, useCreation, useThrottleFn, useLocalStorageState } from "ahooks";
import { ConfirmDialog, Drawer, cn, toast, useRetainedValue } from "@tau/ui";

import Board from "./Board";
import {
  ViewPortPlugin,
  HistoryPlugin,
  CopyPastePlugin,
  CardPlugin,
  SelectPlugin,
  GeometryPlugin,
  HandwritePlugin,
  RichTextPlugin,
  ArrowPlugin,
  ImagePlugin,
  VideoPlugin,
  AudioPlugin,
  MindPlugin,
  PresentationPlugin,
  WebviewPlugin,
  FramePlugin,
  WhiteBoardPlugin,
  ColumnPlugin,
  FileDragDropPlugin,
  ExportImagePlugin,
} from "./plugins";

import {
  BoardContext,
  SelectionContext,
  ViewPortContext,
  BoardStateContext,
  ArrowConnectPointOverlayContext,
  PointerViewportStoreContext,
  type PointerViewportStore,
} from "./context";
import { BOARD_TO_CONTAINER, FIT_VIEW_PADDING } from "./constants";
import {
  BoardElement,
  Point,
  ViewPort,
  Selection,
  PresentationSequence,
  PluginContextMenuItem,
  ContextMenuModalPayload,
  MindNodeElement,
  VideoElement,
  PageSketch,
  DEFAULT_PAGE_SKETCH,
} from "./types";
import Toolbar from "./components/Toolbar";
import AttributeSetter from "./components/AttributeSetter";
import PresentationCreator from "./components/PresentationCreator";
import PresentationMode from "./components/PresentationMode";
import StatusBar from "./components/StatusBar";
import BoardContent from "./components/BoardContent";
import Sidebar from "./components/Sidebar";
import {
  useViewPortControls,
  useEventHandlers,
  useElementsSorting,
  useGridSettings,
  useListenArrowMove,
  ArrowMoveContext,
  useElementsMoving,
  usePreventTextSelection,
} from "./hooks";
import ContextMenuLayer, {
  type ContextMenuItem,
  type BuildMenuItemsParams,
} from "./components/ContextMenuLayer";
import { ViewPortTransforms } from "./transforms";
import { BoardUtil, PathUtil, PointUtil } from "./utils";

import NotePanel from "./components/NotePanel";
import CardSelectorModal from "./components/CardSelectorModal";
import ImageSelectorModal from "./components/ImageSelectorModal";
import WebviewSelectorModal from "./components/WebviewSelectorModal";
import WhiteBoardSelectorModal from "./components/WhiteBoardSelectorModal";
import VideoSelectorModal from "./components/VideoSelectorModal";
import AudioSelectorModal from "./components/AudioSelectorModal";
import ExportImageModal from "./components/ExportImageModal";
import ImagePreviewModal from "./components/ImagePreviewModal";
import EditTitleModal from "@/components/EditTitleModal";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import { createContent, updateContent, decrementContentRefCount } from "@/commands/content";
import { createEmptyVideoNote, getVideoNoteById } from "@/commands";
import { buildCardFromContent, getCardByContentId } from "@/commands/card";
import { buildArticleFromContent, getArticleByContentId } from "@/commands/article";
import { getContentLength } from "@/utils";
import VideoNotePanel from "@/components/VideoNotePanel/VideoNotePanel";
import type { VideoMetaInfo } from "@/types";

const simplifiedRenderZoomThreshold = 0.3;

interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
  initData: BoardElement[] & { presentationSequences?: PresentationSequence[] };
  initViewPort?: ViewPort;
  initSelection?: Selection;
  initPresentationSequences?: PresentationSequence[];
  /** 页级画风（D-106），缺省为普通 */
  initSketch?: PageSketch;
  readonly?: boolean;
  onChange?: (data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences?: PresentationSequence[];
    sketch: PageSketch;
  }) => void;
  showSidebar?: boolean;
  showToolbar?: boolean;
  showAttributeSetter?: boolean;
  showStatusBar?: boolean;
  /** 进出演示模式（宿主页面据此收起画布外的浮动件，如页签条） */
  onPresentationModeChange?: (presenting: boolean) => void;
}

const DEFAULT_PRESENTATION_SEQUENCES: PresentationSequence[] = [];
const DEFAULT_VIEW_PORT: ViewPort = {
  minX: 0,
  minY: 0,
  width: 0,
  height: 0,
  zoom: 1,
};
const DEFAULT_SELECTION: Selection = {
  selectArea: null,
  selectedElements: [] as BoardElement[],
};

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

export interface WhiteBoardRef {
  fitAllElements: (padding?: number, animate?: boolean) => void;
  getElements: () => BoardElement[];
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (zoom: number) => void;
  /** 选中并滚入视野，派发 element:flash 让元素闪一下；元素不存在返回 false */
  revealElement: (id: string) => boolean;
}

const WhiteBoard = memo(
  forwardRef<WhiteBoardRef, WhiteBoardProps>((props, ref) => {
    const {
      className,
      style,
      initData,
      initViewPort = DEFAULT_VIEW_PORT,
      initSelection = DEFAULT_SELECTION,
      initPresentationSequences = DEFAULT_PRESENTATION_SEQUENCES,
      initSketch = DEFAULT_PAGE_SKETCH,
      readonly,
      onChange,
      showSidebar = false,
      showToolbar,
      showAttributeSetter,
      showStatusBar = true,
      onPresentationModeChange,
    } = props;

    const toolbarVisible = showToolbar ?? !readonly;
    const attributeSetterVisible = showAttributeSetter ?? !readonly;

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
    const [imagePreview, setImagePreview] = useState<{
      open: boolean;
      src: string;
      alt?: string;
    }>({
      open: false,
      src: "",
      alt: undefined,
    });

    // 引用
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const connectPointOverlayRef = useRef<SVGGElement>(null);
    const statusBarRef = useRef<HTMLDivElement>(null);
    const pointerViewportStore = useCreation<PointerViewportStore>(() => {
      let currentPoint: Point | null = null;
      const listeners = new Set<() => void>();

      return {
        getSnapshot: () => currentPoint,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        setPoint: (point: Point | null) => {
          const isSamePoint =
            (currentPoint === null && point === null) ||
            (!!currentPoint && !!point && currentPoint.x === point.x && currentPoint.y === point.y);
          if (isSamePoint) return;
          currentPoint = point;
          listeners.forEach(listener => listener());
        },
      };
    }, []);

    // 网格设置
    const { gridVisible, gridSize, handleGridVisibleChange, handleGridSizeChange } =
      useGridSettings();

    // 创建画板实例
    const board = useCreation<Board>(() => {
      const plugins = [
        new ArrowPlugin(),
        new GeometryPlugin(),
        new HandwritePlugin(),
        new CardPlugin(),
        new WhiteBoardPlugin(),
        new RichTextPlugin(),
        new ImagePlugin(),
        new VideoPlugin(),
        new AudioPlugin(),
        new MindPlugin(),
        new WebviewPlugin(),
        new FramePlugin(),
        new ColumnPlugin(),
        new FileDragDropPlugin(),
        new HistoryPlugin(),
        new SelectPlugin(),
        new ViewPortPlugin(),
        new CopyPastePlugin(),
        new ExportImagePlugin(),
        new PresentationPlugin(),
      ];
      return new Board(
        initData,
        initViewPort,
        initSelection,
        plugins,
        initPresentationSequences,
        readonly,
        initSketch
      );
    }, []);

    // @ts-ignore
    // window.board = board;

    const isArrowMoving = useListenArrowMove(board);
    const { isMoving: isElementsMoving, movingStore } = useElementsMoving(board);
    const { markInteracting } = usePreventTextSelection(containerRef);
    const [refLineVersion, setRefLineVersion] = useState(0);

    // 右键菜单触发的弹窗状态
    const [contextMenuModal, setContextMenuModal] = useState<ContextMenuModalPayload | null>(null);
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

      await updateContent(newContentId, currentContent);

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
          const { contentId } = await ensureRichTextContentId(payload.elementId);
          const latestElement = BoardUtil.getElementById(board, payload.elementId) as
            | (BoardElement & {
                linkedCardId?: number;
                linkedArticleId?: number;
              })
            | null;
          if (payload.mode === "card") {
            const card = await buildCardFromContent(contentId);
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

    const buildContextMenuItems = useMemoizedFn(
      ({
        context,
        board: boardInstance,
        readonly: isReadonly,
      }: BuildMenuItemsParams): ContextMenuItem[] => {
        // 调用 board.getContextMenu 获取插件菜单项
        const pluginItems = boardInstance.getContextMenu(context);

        // 转换 PluginContextMenuItem 为 ContextMenuItem
        const convertItem = (item: PluginContextMenuItem): ContextMenuItem => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
          shortcut: item.shortcut,
          danger: item.danger,
          disabled: item.disabled || isReadonly,
          children: item.children?.map(convertItem),
          onSelect: () => {
            item.onSelect({ ...context, board: boardInstance });
          },
        });

        return pluginItems.map(convertItem);
      }
    );

    // 获取画板数据
    const { children, viewPort, selection } = useSyncExternalStore(
      board.subscribe,
      board.getSnapshot
    );
    const { zoom } = viewPort;

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

    // 获取演示模式状态（直接从 board.presentationManager 订阅）
    const isPresentationMode = useSyncExternalStore(
      callback => {
        board.presentationManager.on("presentationModeChange", callback);
        return () => board.presentationManager.off("presentationModeChange", callback);
      },
      () => board.presentationManager.isPresentationMode
    );
    const notifyPresentationMode = useMemoizedFn((presenting: boolean) =>
      onPresentationModeChange?.(presenting)
    );
    useEffect(() => {
      notifyPresentationMode(isPresentationMode);
      if (isPresentationMode) return () => notifyPresentationMode(false);
    }, [isPresentationMode, notifyPresentationMode]);

    const currentSequence = useSyncExternalStore(
      callback => {
        board.presentationManager.on("presentationCurrentSequenceChange", callback);
        return () => board.presentationManager.off("presentationCurrentSequenceChange", callback);
      },
      () => board.presentationManager.currentSequence
    );

    const currentFrameIndex = useSyncExternalStore(
      callback => {
        board.presentationManager.on("presentationCurrentFrameIndexChange", callback);
        return () => board.presentationManager.off("presentationCurrentFrameIndexChange", callback);
      },
      () => board.presentationManager.currentFrameIndex
    );

    // 演示模式下过滤只显示当前帧包含的元素
    const filteredChildren = useMemo(() => {
      // 非演示模式返回所有元素
      if (!isPresentationMode || !currentSequence || currentFrameIndex === null) {
        return children;
      }

      const currentFrame = currentSequence.frames[currentFrameIndex];
      if (!currentFrame) return children;

      const frameElementIds = new Set(currentFrame.elements);

      // 递归过滤元素
      const filterElements = (elements: BoardElement[]): BoardElement[] => {
        return elements
          .map(element => {
            // 如果元素在帧中，保留它及其所有子元素
            if (frameElementIds.has(element.id)) {
              return element;
            }
            // 如果元素不在帧中，检查其子元素是否有在帧中的
            if (element.children && element.children.length > 0) {
              const filteredChildElements = filterElements(element.children);
              if (filteredChildElements.length > 0) {
                // 有子元素在帧中，保留父元素但替换子元素为过滤后的
                return { ...element, children: filteredChildElements };
              }
            }
            return null;
          })
          .filter((element): element is BoardElement => element !== null);
      };

      return filterElements(children);
    }, [children, isPresentationMode, currentSequence, currentFrameIndex]);

    // 对元素进行分组排序
    const {
      centerConnectArrows,
      noneCenterConnectArrows,
      centerConnectAndSelectedArrows,
      isolateStaticSelection,
    } = useElementsSorting(filteredChildren, selection);

    // 获取视口控制函数
    const { handleContainerResize, handleZoomIn, handleZoomOut, handleZoomTo, handleFitElements } =
      useViewPortControls(board, zoom);

    // 暴露 ref 方法
    useImperativeHandle(
      ref,
      () => ({
        fitAllElements: (padding = FIT_VIEW_PADDING, animate = true) => {
          ViewPortTransforms.fitAllElements(board, padding, animate);
        },
        getElements: () => board.children,
        zoomIn: () => handleZoomIn(),
        zoomOut: () => handleZoomOut(),
        zoomTo: (zoomValue: number) => handleZoomTo(zoomValue),
        revealElement: (id: string) => {
          const element = BoardUtil.getElementById(board, id);
          if (!element) return false;
          board.apply(
            {
              type: "set_selection",
              properties: board.selection,
              newProperties: { selectedElements: [element], selectArea: null },
            },
            false
          );
          ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
          board.emit("element:flash", id);
          return true;
        },
      }),
      [board, handleZoomIn, handleZoomOut, handleZoomTo]
    );

    // 事件处理
    const {
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleMouseEnter,
      handleMouseLeave,
      handleContextMenu,
      handleClick,
      handleDblClick,
      handleOnPointerDown,
      handleOnPointerMove: nonThrottledHandleOnPointerMove,
      handleOnPointerUp,
      handleKeyDown,
      handleKeyUp,
      handleGlobalMouseDown,
      handleGlobalMouseUp,
      handleOnWheel: noStopPropagationOnWheel,
      handleOnGlobalPointerDown,
      handleOnGlobalPointerMove,
      handleOnGlobalPointerUp,
      handleOnGlobalPointerCancel,
      handleOnPaste,
      handleOnCopy,
      handleOnCut,
      handleOnDrop,
      handleOnDragOver,
      handleOnDragEnter,
      handleOnDragLeave,
    } = useEventHandlers(board);

    // 节流处理指针移动事件
    const { run: handleOnPointerMove } = useThrottleFn(nonThrottledHandleOnPointerMove, {
      wait: 25,
    });

    const setPointerViewport = useMemoizedFn((event: React.PointerEvent<HTMLDivElement>) => {
      const point = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
      pointerViewportStore.setPoint(point ?? null);
    });
    const clearPointerViewport = useMemoizedFn(() => {
      pointerViewportStore.setPoint(null);
    });

    const handleContainerPointerDown = useMemoizedFn(
      (event: React.PointerEvent<HTMLDivElement>) => {
        // 必须最先同步置位，拦截随后触发的 selectstart，防止拖拽/框选时误选 HTML 文字
        markInteracting(event.target);
        setPointerViewport(event);
        handleOnPointerDown(event);
      }
    );

    const handleContainerPointerMove = useMemoizedFn(
      (event: React.PointerEvent<HTMLDivElement>) => {
        setPointerViewport(event);
        handleOnPointerMove(event);
      }
    );

    const handleContainerPointerUp = useMemoizedFn((event: React.PointerEvent<HTMLDivElement>) => {
      setPointerViewport(event);
      handleOnPointerUp(event);
    });
    const handleContainerPointerLeave = useMemoizedFn(() => {
      clearPointerViewport();
    });
    const handleContainerPointerCancel = useMemoizedFn(() => {
      clearPointerViewport();
    });

    const handleOnWheel = useMemoizedFn((e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      noStopPropagationOnWheel(e);
    });

    // 监听数据变化
    useEffect(() => {
      const handleChange = () => {
        onChange?.(board.getSnapshot());
      };
      board.on("change", handleChange);

      return () => {
        board.off("change", handleChange);
      };
    }, [board, onChange]);
    useEffect(() => {
      const handleWindowBlur = () => {
        clearPointerViewport();
      };
      window.addEventListener("blur", handleWindowBlur);
      return () => {
        window.removeEventListener("blur", handleWindowBlur);
      };
    }, [clearPointerViewport]);

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
      const node = unlinkNodeId
        ? (BoardUtil.getElementById(board, unlinkNodeId) as MindNodeElement | null)
        : null;
      setUnlinkNodeId(null);
      if (!node?.contentId) return;
      const unlinkContentId = node.contentId;
      await decrementContentRefCount(unlinkContentId);
      const nodePath = PathUtil.getPathByElement(board, node);
      if (!nodePath) return;
      board.apply({
        type: "set_node",
        path: nodePath,
        properties: { contentId: node.contentId, contentTitle: node.contentTitle },
        newProperties: { contentId: undefined, contentTitle: undefined },
      });
      // 若侧边栏正打开该笔记，则一并关闭
      if (activeNoteIdRef.current === unlinkContentId) {
        setActiveNoteId(null);
        setActiveNoteTitle(null);
      }
    });

    useEffect(() => {
      const handleRefLineChange = () => {
        setRefLineVersion(value => value + 1);
      };
      board.on("ref-line:change", handleRefLineChange);
      return () => {
        board.off("ref-line:change", handleRefLineChange);
      };
    }, [board]);

    useEffect(() => {
      const handleOpenImagePreview = (payload: { src: string; alt?: string }) => {
        if (!payload?.src) return;
        setImagePreview({
          open: true,
          src: payload.src,
          alt: payload.alt,
        });
      };
      board.on("image:preview:open", handleOpenImagePreview);
      return () => {
        board.off("image:preview:open", handleOpenImagePreview);
      };
    }, [board]);

    // 设置容器，添加和清理事件监听器
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      BOARD_TO_CONTAINER.set(board, container);

      document.addEventListener("paste", handleOnPaste);
      document.addEventListener("copy", handleOnCopy);
      document.addEventListener("cut", handleOnCut);

      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);

      document.addEventListener("mousedown", handleGlobalMouseDown);
      document.addEventListener("mouseup", handleGlobalMouseUp);

      container.addEventListener("wheel", handleOnWheel, {
        passive: false,
      });

      document.addEventListener("pointerdown", handleOnGlobalPointerDown);
      document.addEventListener("pointermove", handleOnGlobalPointerMove);
      document.addEventListener("pointerup", handleOnGlobalPointerUp);
      document.addEventListener("pointercancel", handleOnGlobalPointerCancel);

      const observer = new ResizeObserver(handleContainerResize);
      observer.observe(container);

      const statusBar = statusBarRef.current;

      const stopPropagation = (e: Event) => {
        e.stopPropagation();
      };

      if (statusBar) {
        statusBar.addEventListener("pointerdown", stopPropagation);
        statusBar.addEventListener("pointerup", stopPropagation);
        statusBar.addEventListener("mouseup", stopPropagation);
      }

      return () => {
        document.removeEventListener("mousedown", handleGlobalMouseDown);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("keyup", handleKeyUp);
        container.removeEventListener("wheel", handleOnWheel);
        document.removeEventListener("pointerdown", handleOnGlobalPointerDown);
        document.removeEventListener("pointermove", handleOnGlobalPointerMove);
        document.removeEventListener("pointerup", handleOnGlobalPointerUp);
        document.removeEventListener("pointercancel", handleOnGlobalPointerCancel);
        document.removeEventListener("paste", handleOnPaste);
        document.removeEventListener("copy", handleOnCopy);
        document.removeEventListener("cut", handleOnCut);

        if (statusBar) {
          statusBar.removeEventListener("pointerdown", stopPropagation, true);
          statusBar.removeEventListener("pointerup", stopPropagation, true);
          statusBar.removeEventListener("mouseup", stopPropagation, true);
        }

        board.clearRefLines();

        observer.disconnect();
        board.destroy();
      };
    }, [board, handleContainerResize]);

    // 获取参考线
    const refLines = useMemo(
      () => board.refLine.matchRefLines(15 / zoom),
      [board, zoom, refLineVersion]
    );

    // 演示相关处理函数
    const handleStartPresentation = useMemoizedFn((sequenceId: string) => {
      board.presentationManager.startPresentationMode(sequenceId);
    });

    const handleEditSequence = useMemoizedFn((sequenceId: string) => {
      board.presentationManager.setCurrentSequence(sequenceId);
      board.presentationManager.startCreatingSequence();
    });

    const handleDeleteSequence = useMemoizedFn((sequenceId: string) => {
      board.presentationManager.deleteSequence(sequenceId);
    });

    // 全览功能
    const handleFitAll = useMemoizedFn((e: React.MouseEvent<HTMLElement>) => {
      return handleFitElements(FIT_VIEW_PADDING, true)(e);
    });

    const handleCloseImagePreview = useMemoizedFn(() => {
      setImagePreview({
        open: false,
        src: "",
        alt: undefined,
      });
    });

    return (
      <BoardContext.Provider value={board}>
        <SelectionContext.Provider value={selection}>
          <ViewPortContext.Provider value={viewPort}>
            <ArrowMoveContext.Provider value={{ isMoving: isArrowMoving }}>
              <BoardStateContext.Provider
                value={{
                  isMoving: isElementsMoving,
                  movingStore,
                  simplifiedRenderZoomThreshold,
                }}
              >
                <ArrowConnectPointOverlayContext.Provider value={connectPointOverlayRef}>
                  <PointerViewportStoreContext.Provider value={pointerViewportStore}>
                    <div className="relative flex h-full">
                      {/* 元素树停靠栏：纸面内左栏，开关在宿主页面的面包屑 */}
                      {showSidebar && !isPresentationMode && <Sidebar />}
                      <div
                        ref={containerRef}
                        className={cn(
                          "[:fullscreen]:w-screen [:fullscreen]:h-screen [:fullscreen]:bg-surface relative h-full min-w-0 flex-1",
                          className
                        )}
                        style={style}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        onContextMenu={handleContextMenu}
                        onClick={handleClick}
                        onDoubleClick={handleDblClick}
                        onPointerDown={handleContainerPointerDown}
                        onPointerMove={handleContainerPointerMove}
                        onPointerUp={handleContainerPointerUp}
                        onPointerLeave={handleContainerPointerLeave}
                        onPointerCancel={handleContainerPointerCancel}
                        onDrop={handleOnDrop}
                        onDragOver={handleOnDragOver}
                        onDragEnter={handleOnDragEnter}
                        onDragLeave={handleOnDragLeave}
                      >
                        <div className="relative h-full w-full">
                          {toolbarVisible && <Toolbar />}

                          <BoardContent
                            ref={svgRef}
                            board={board}
                            viewPort={viewPort}
                            centerConnectArrows={centerConnectArrows}
                            noneCenterConnectArrows={noneCenterConnectArrows}
                            centerConnectAndSelectedArrows={centerConnectAndSelectedArrows}
                            isolateStaticSelection={isolateStaticSelection}
                            gridVisible={gridVisible}
                            gridSize={gridSize}
                            refLines={refLines}
                            connectPointOverlayRef={connectPointOverlayRef}
                          />

                          {attributeSetterVisible && <AttributeSetter />}
                        </div>

                        <PresentationCreator />
                        <PresentationMode />

                        {showStatusBar && (
                          <StatusBar
                            ref={statusBarRef}
                            gridVisible={gridVisible}
                            gridSize={gridSize}
                            zoom={zoom}
                            sequences={board.presentationManager.sequences}
                            onGridVisibleChange={handleGridVisibleChange}
                            onGridSizeChange={handleGridSizeChange}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onZoomTo={handleZoomTo}
                            onFitElements={handleFitAll}
                            onStartPresentation={handleStartPresentation}
                            onEditSequence={handleEditSequence}
                            onDeleteSequence={handleDeleteSequence}
                          />
                        )}

                        <ContextMenuLayer
                          board={board}
                          containerRef={containerRef}
                          readonly={readonly}
                          buildMenuItems={buildContextMenuItems}
                        />
                      </div>
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
                      <CardSelectorModal
                        open={contextMenuModal?.type === "card"}
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
                          contextMenuModal?.action === "reference" ||
                          contextMenuModal?.action === "create"
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
                      <ExportImageModal
                        open={contextMenuModal?.type === "export-image"}
                        onClose={() => setContextMenuModal(null)}
                        board={board}
                        action={contextMenuModal?.action}
                        selectedElementIds={contextMenuModal?.selectedElementIds}
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
                      <ImagePreviewModal
                        open={imagePreview.open}
                        src={imagePreview.src}
                        alt={imagePreview.alt}
                        onClose={handleCloseImagePreview}
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
                    </div>
                  </PointerViewportStoreContext.Provider>
                </ArrowConnectPointOverlayContext.Provider>
              </BoardStateContext.Provider>
            </ArrowMoveContext.Provider>
          </ViewPortContext.Provider>
        </SelectionContext.Provider>
      </BoardContext.Provider>
    );
  })
);

export default WhiteBoard;
export * from "./types";
