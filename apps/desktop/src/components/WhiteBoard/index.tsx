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
import {
  useMemoizedFn,
  useCreation,
  useThrottleFn,
  useLocalStorageState,
} from "ahooks";
import classnames from "classnames";

import Board from "./Board";
import {
  ViewPortPlugin,
  MovePlugin,
  HistoryPlugin,
  CopyPastePlugin,
  CardPlugin,
  SelectPlugin,
  GeometryPlugin,
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
} from "./plugins";

import {
  BoardContext,
  SelectionContext,
  ViewPortContext,
  BoardStateContext,
} from "./context";
import { BOARD_TO_CONTAINER, FIT_VIEW_PADDING } from "./constants";
import {
  BoardElement,
  ViewPort,
  Selection,
  PresentationSequence,
  PluginContextMenuItem,
  ContextMenuModalPayload,
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
} from "./hooks";
import ContextMenuLayer, {
  type ContextMenuItem,
  type BuildMenuItemsParams,
} from "./components/ContextMenuLayer";
import { ViewPortTransforms } from "./transforms";

import SidebarToggleButton from "@/components/SidebarToggleButton";

import styles from "./index.module.less";
import ResizeableAndHideableSidebar from "../ResizableAndHideableSidebar";
import NotePanel from "./components/NotePanel";
import CardSelectorModal from "./components/CardSelectorModal";
import ImageSelectorModal from "./components/ImageSelectorModal";
import WebviewSelectorModal from "./components/WebviewSelectorModal";
import WhiteBoardSelectorModal from "./components/WhiteBoardSelectorModal";
import VideoSelectorModal from "./components/VideoSelectorModal";
import AudioSelectorModal from "./components/AudioSelectorModal";

// 初始化插件
const viewPortPlugin = new ViewPortPlugin();
const selectPlugin = new SelectPlugin();
const movePlugin = new MovePlugin();
const historyPlugin = new HistoryPlugin();
const copyPastePlugin = new CopyPastePlugin();
const arrowPlugin = new ArrowPlugin();
const richTextPlugin = new RichTextPlugin();
const geometryPlugin = new GeometryPlugin();
const cardPlugin = new CardPlugin();
const imagePlugin = new ImagePlugin();
const videoPlugin = new VideoPlugin();
const audioPlugin = new AudioPlugin();
const mindPlugin = new MindPlugin();
const presentationPlugin = new PresentationPlugin();
const webviewPlugin = new WebviewPlugin();
const framePlugin = new FramePlugin();
const whiteBoardPlugin = new WhiteBoardPlugin();
const columnPlugin = new ColumnPlugin();
const fileDragDropPlugin = new FileDragDropPlugin();

const simplifiedRenderZoomThreshold = 0.2;

interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
  initData: BoardElement[] & { presentationSequences?: PresentationSequence[] };
  initViewPort?: ViewPort;
  initSelection?: Selection;
  initPresentationSequences?: PresentationSequence[];
  readonly?: boolean;
  onChange?: (data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences?: PresentationSequence[];
  }) => void;
  whiteboardContentId?: number;
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

export interface WhiteBoardRef {
  fitAllElements: (padding?: number, animate?: boolean) => void;
  getElements: () => BoardElement[];
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
      readonly,
      onChange,
      whiteboardContentId,
    } = props;

    const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
      "whiteboard-sidebar-width",
      {
        defaultValue: 300,
      },
    );
    const [sidebarOpen, setSidebarOpen] = useLocalStorageState(
      "whiteboard-sidebar-open",
      {
        defaultValue: true,
      },
    );

    const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
    const [activeNoteTitle, setActiveNoteTitle] = useState<string | null>(null);

    // 引用
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const statusBarRef = useRef<HTMLDivElement>(null);

    // 网格设置
    const {
      gridVisible,
      gridSize,
      handleGridVisibleChange,
      handleGridSizeChange,
    } = useGridSettings();

    // 创建画板实例
    const board = useCreation<Board>(() => {
      const plugins = [
        arrowPlugin,
        geometryPlugin,
        cardPlugin,
        whiteBoardPlugin,
        richTextPlugin,
        imagePlugin,
        videoPlugin,
        audioPlugin,
        mindPlugin,
        webviewPlugin,
        framePlugin,
        columnPlugin,
        fileDragDropPlugin,
        historyPlugin,
        selectPlugin,
        movePlugin,
        viewPortPlugin,
        copyPastePlugin,
        presentationPlugin,
      ];
      return new Board(
        initData,
        initViewPort,
        initSelection,
        plugins,
        initPresentationSequences,
        readonly,
      );
    }, []);

    // @ts-ignore
    // window.board = board;

    const isArrowMoving = useListenArrowMove(board);
    const isElementsMoving = useElementsMoving(board);
    const [refLineVersion, setRefLineVersion] = useState(0);

    // 右键菜单触发的弹窗状态
    const [contextMenuModal, setContextMenuModal] =
      useState<ContextMenuModalPayload | null>(null);

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
      },
    );

    // 获取画板数据
    const { children, viewPort, selection } = useSyncExternalStore(
      board.subscribe,
      board.getSnapshot,
    );
    const { zoom } = viewPort;

    // 获取演示模式状态（直接从 board.presentationManager 订阅）
    const isPresentationMode = useSyncExternalStore(
      (callback) => {
        board.presentationManager.on("presentationModeChange", callback);
        return () =>
          board.presentationManager.off("presentationModeChange", callback);
      },
      () => board.presentationManager.isPresentationMode,
    );

    const currentSequence = useSyncExternalStore(
      (callback) => {
        board.presentationManager.on(
          "presentationCurrentSequenceChange",
          callback,
        );
        return () =>
          board.presentationManager.off(
            "presentationCurrentSequenceChange",
            callback,
          );
      },
      () => board.presentationManager.currentSequence,
    );

    const currentFrameIndex = useSyncExternalStore(
      (callback) => {
        board.presentationManager.on(
          "presentationCurrentFrameIndexChange",
          callback,
        );
        return () =>
          board.presentationManager.off(
            "presentationCurrentFrameIndexChange",
            callback,
          );
      },
      () => board.presentationManager.currentFrameIndex,
    );

    // 演示模式下过滤只显示当前帧包含的元素
    const filteredChildren = useMemo(() => {
      // 非演示模式返回所有元素
      if (
        !isPresentationMode ||
        !currentSequence ||
        currentFrameIndex === null
      ) {
        return children;
      }

      const currentFrame = currentSequence.frames[currentFrameIndex];
      if (!currentFrame) return children;

      const frameElementIds = new Set(currentFrame.elements);

      // 递归过滤元素
      const filterElements = (elements: BoardElement[]): BoardElement[] => {
        return elements
          .map((element) => {
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
    } = useElementsSorting(filteredChildren, selection);

    // 获取视口控制函数
    const {
      handleContainerResize,
      handleZoomIn,
      handleZoomOut,
      handleZoomTo,
      handleFitElements,
    } = useViewPortControls(board, zoom);

    // 暴露 ref 方法
    useImperativeHandle(
      ref,
      () => ({
        fitAllElements: (padding = FIT_VIEW_PADDING, animate = true) => {
          ViewPortTransforms.fitAllElements(board, padding, animate);
        },
        getElements: () => board.children,
      }),
      [board],
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
      handleOnPaste,
      handleOnCopy,
      handleOnCut,
      handleOnDrop,
      handleOnDragOver,
      handleOnDragEnter,
      handleOnDragLeave,
    } = useEventHandlers(board);

    // 节流处理指针移动事件
    const { run: handleOnPointerMove } = useThrottleFn(
      nonThrottledHandleOnPointerMove,
      {
        wait: 25,
      },
    );

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
      if (whiteboardContentId != null) {
        board.setResourceSource({
          type: "whiteboard",
          id: whiteboardContentId,
        });
      } else {
        board.setResourceSource(undefined);
      }
    }, [board, whiteboardContentId]);

    // 监听打开笔记事件
    useEffect(() => {
      const handleOpenNote = (contentId: number, contentTitle: string) => {
        setActiveNoteId(contentId);
        setActiveNoteTitle(contentTitle);
      };
      board.on("open-note", handleOpenNote);
      return () => {
        board.off("open-note", handleOpenNote);
      };
    }, [board]);

    useEffect(() => {
      const handleRefLineChange = () => {
        setRefLineVersion((value) => value + 1);
      };
      board.on("ref-line:change", handleRefLineChange);
      return () => {
        board.off("ref-line:change", handleRefLineChange);
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
      [board, zoom, refLineVersion],
    );

    // 演示相关处理函数
    const handleStartPresentation = useMemoizedFn((sequenceId: string) => {
      board.presentationManager.startPresentationMode(sequenceId);
    });

    const handleEditSequence = useMemoizedFn((sequenceId: string) => {
      board.presentationManager.setCurrentSequence(sequenceId);
    });

    const handleDeleteSequence = useMemoizedFn((sequenceId: string) => {
      board.presentationManager.deleteSequence(sequenceId);
    });

    // 全览功能
    const handleFitAll = useMemoizedFn(
      (e: React.MouseEvent<HTMLDivElement>) => {
        return handleFitElements(FIT_VIEW_PADDING, true)(e);
      },
    );

    return (
      <BoardContext.Provider value={board}>
        <SelectionContext.Provider value={selection}>
          <ViewPortContext.Provider value={viewPort}>
            <ArrowMoveContext.Provider value={{ isMoving: isArrowMoving }}>
              <BoardStateContext.Provider
                value={{
                  isMoving: isElementsMoving,
                  simplifiedRenderZoomThreshold,
                }}
              >
                <div className="flex h-full relative">
                  <ResizeableAndHideableSidebar
                    className="relative shrink-0 h-full flex-none overflow-hidden border-r border-[#f0f0f0] dark:border-[#2a2a2a]"
                    width={sidebarWidth ?? 300}
                    onWidthChange={setSidebarWidth}
                    open={!!sidebarOpen}
                    disableResize={!sidebarOpen}
                  >
                    <Sidebar />
                    <SidebarToggleButton.Collapse
                      onToggle={() => setSidebarOpen(!sidebarOpen)}
                      side="left"
                    />
                  </ResizeableAndHideableSidebar>
                  <SidebarToggleButton.Expand
                    isHidden={!sidebarOpen}
                    onToggle={() => setSidebarOpen(!sidebarOpen)}
                    side="left"
                  />
                  <div
                    ref={containerRef}
                    className={classnames(
                      "flex-1 min-w-0",
                      styles.boardContainer,
                      className,
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
                    onPointerDown={handleOnPointerDown}
                    onPointerMove={handleOnPointerMove}
                    onPointerUp={handleOnPointerUp}
                    onDrop={handleOnDrop}
                    onDragOver={handleOnDragOver}
                    onDragEnter={handleOnDragEnter}
                    onDragLeave={handleOnDragLeave}
                  >
                    <div className="relative h-full w-full">
                      {!readonly && <Toolbar />}

                      <BoardContent
                        ref={svgRef}
                        board={board}
                        viewPort={viewPort}
                        centerConnectArrows={centerConnectArrows}
                        noneCenterConnectArrows={noneCenterConnectArrows}
                        centerConnectAndSelectedArrows={
                          centerConnectAndSelectedArrows
                        }
                        gridVisible={gridVisible}
                        gridSize={gridSize}
                        refLines={refLines}
                      />

                      <div className={styles.verticalBar}>
                        {!readonly && <AttributeSetter />}
                      </div>
                    </div>

                    <PresentationCreator />
                    <PresentationMode />

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

                    <ContextMenuLayer
                      board={board}
                      containerRef={containerRef}
                      readonly={readonly}
                      buildMenuItems={buildContextMenuItems}
                    />
                  </div>
                  <NotePanel
                    contentId={activeNoteId ?? undefined}
                    contentTitle={activeNoteTitle ?? undefined}
                    onClose={() => setActiveNoteId(null)}
                  />

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
                </div>
              </BoardStateContext.Provider>
            </ArrowMoveContext.Provider>
          </ViewPortContext.Provider>
        </SelectionContext.Provider>
      </BoardContext.Provider>
    );
  }),
);

export default WhiteBoard;
export * from "./types";
