import React, { memo, useEffect, useRef, useSyncExternalStore } from "react";
import { useMemoizedFn, useCreation, useThrottleFn } from "ahooks";
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
  MindPlugin,
  PresentationPlugin,
  WebviewPlugin,
  FramePlugin,
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
} from "./types";
import Toolbar from "./components/Toolbar";
import AttributeSetter from "./components/AttributeSetter";
import PresentationCreator from "./components/PresentationCreator";
import PresentationMode from "./components/PresentationMode";
import StatusBar from "./components/StatusBar";
import BoardContent from "./components/BoardContent";
import {
  useViewPortControls,
  useEventHandlers,
  useElementsSorting,
  useGridSettings,
  useListenArrowMove,
  ArrowMoveContext,
  useElementsMoving,
} from "./hooks";

import styles from "./index.module.less";

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
const mindPlugin = new MindPlugin();
const presentationPlugin = new PresentationPlugin();
const webviewPlugin = new WebviewPlugin();
const framePlugin = new FramePlugin();

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
}

const WhiteBoard = memo((props: WhiteBoardProps) => {
  const {
    className,
    style,
    initData,
    initViewPort = { minX: 0, minY: 0, width: 0, height: 0, zoom: 1 },
    initSelection = {
      selectArea: null,
      selectedElements: [] as BoardElement[],
    },
    initPresentationSequences = [],
    readonly,
    onChange,
  } = props;

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
      richTextPlugin,
      imagePlugin,
      videoPlugin,
      mindPlugin,
      webviewPlugin,
      framePlugin,
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

  const isArrowMoving = useListenArrowMove(board);
  const isElementsMoving = useElementsMoving(board);

  // 获取画板数据
  const { children, viewPort, selection } = useSyncExternalStore(
    board.subscribe,
    board.getSnapshot,
  );
  const { zoom } = viewPort;

  // 对元素进行分组排序
  const { centerConnectArrows, noneCenterConnectArrows } = useElementsSorting(
    children,
    selection,
  );

  // 获取视口控制函数
  const {
    handleContainerResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomTo,
    handleFitElements,
  } = useViewPortControls(board, zoom);

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
  } = useEventHandlers(board);

  // 节流处理指针移动事件
  const { run: handleOnPointerMove } = useThrottleFn(
    nonThrottledHandleOnPointerMove,
    { wait: 25 },
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
  const refLines = board.refLine.matchRefLines(15 / zoom);

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
  const handleFitAll = useMemoizedFn((e: React.MouseEvent<HTMLDivElement>) => {
    return handleFitElements(FIT_VIEW_PADDING, true)(e);
  });

  return (
    <div
      ref={containerRef}
      className={classnames(styles.boardContainer, className)}
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
    >
      <BoardContext.Provider value={board}>
        <SelectionContext.Provider value={selection}>
          <ViewPortContext.Provider value={viewPort}>
            <ArrowMoveContext.Provider value={{ isMoving: isArrowMoving }}>
              <BoardStateContext.Provider
                value={{ isMoving: isElementsMoving }}
              >
                {/* 工具栏 */}
                {!readonly && <Toolbar />}

                {/* 画板内容 */}
                <BoardContent
                  ref={svgRef}
                  board={board}
                  viewPort={viewPort}
                  centerConnectArrows={centerConnectArrows}
                  noneCenterConnectArrows={noneCenterConnectArrows}
                  gridVisible={gridVisible}
                  gridSize={gridSize}
                  refLines={refLines}
                />

                {/* 垂直工具栏 */}
                <div className={styles.verticalBar}>
                  {!readonly && <AttributeSetter />}
                </div>

                {/* 演示相关组件 */}
                <PresentationCreator />
                <PresentationMode />

                {/* 状态栏 */}
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
              </BoardStateContext.Provider>
            </ArrowMoveContext.Provider>
          </ViewPortContext.Provider>
        </SelectionContext.Provider>
      </BoardContext.Provider>
    </div>
  );
});

export default WhiteBoard;
export * from "./types";
