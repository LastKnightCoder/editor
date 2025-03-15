import React, {
  memo,
  useMemo,
  useEffect,
  useRef,
  useSyncExternalStore,
  useState,
} from "react";
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
} from "./plugins";
import { ViewPortTransforms } from "./transforms";
import { BoardContext, SelectionContext, ViewPortContext } from "./context";
import {
  BOARD_TO_CONTAINER,
  ARROW_SIZE,
  ZOOMS,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_VISIBLE,
} from "./constants";
import { BoardElement, Events, ViewPort, Selection } from "./types";
import Toolbar from "./components/Toolbar";
import SelectArea from "./components/SelectArea";
import GradientLine from "./components/GradientLine";
import Grid from "./components/Grid";
import GridSettings from "./components/GridSettings";
import AttributeSetter from "./components/AttributeSetter";
import { Flex, Popover, Divider, Tooltip } from "antd";
import {
  MinusOutlined,
  PlusOutlined,
  FullscreenOutlined,
} from "@ant-design/icons";
import For from "@/components/For";
import styles from "./index.module.less";

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

const plugins = [
  arrowPlugin,
  geometryPlugin,
  cardPlugin,
  richTextPlugin,
  imagePlugin,
  videoPlugin,
  mindPlugin,
  historyPlugin,
  selectPlugin,
  movePlugin,
  viewPortPlugin,
  copyPastePlugin,
];

interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
  initData: BoardElement[];
  initViewPort?: ViewPort;
  initSelection?: Selection;
  readonly?: boolean;
  onChange?: (data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
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
    readonly,
    onChange,
  } = props;

  const [gridVisible, setGridVisible] = useState<boolean>(DEFAULT_GRID_VISIBLE);
  const [gridSize, setGridSize] = useState<number>(DEFAULT_GRID_SIZE);
  // 固定内边距值，不需要用户设置
  const FIT_VIEW_PADDING = 50;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const fitViewButtonRef = useRef<HTMLDivElement>(null);

  const board = useCreation<Board>(
    () => new Board(initData, initViewPort, initSelection, plugins, readonly),
    [],
  );

  const { children, viewPort, selection } = useSyncExternalStore(
    board.subscribe,
    board.getSnapshot,
  );
  const { minX, minY, width, height, zoom } = viewPort;

  const [centerConnectArrows, noneCenterConnectArrows] = useMemo(() => {
    const isCenterConnectAndNotSelected = (element: BoardElement) => {
      const isCenterConnectArrow =
        element.type === "arrow" &&
        (element.source?.connectId === "center" ||
          element.target?.connectId === "center");
      const isSelected = selection.selectedElements.some(
        (selectedElement) => selectedElement.id === element.id,
      );
      return isCenterConnectArrow && !isSelected;
    };

    const centerConnectArrows = children.filter(isCenterConnectAndNotSelected);
    const noneCenterConnectArrows = children.filter(
      (element) => !isCenterConnectAndNotSelected(element),
    );

    return [centerConnectArrows, noneCenterConnectArrows];
  }, [children, selection]);

  useEffect(() => {
    const handleChange = () => {
      onChange?.(board.getSnapshot());
    };
    board.on("change", handleChange);

    return () => {
      board.off("change", handleChange);
    };
  }, [board, onChange]);

  const eventHandlerGenerator = useMemoizedFn((eventName: Events) => {
    return (event: any) => {
      board[eventName](event);
    };
  });

  const handleContainerResize = useMemoizedFn(() => {
    ViewPortTransforms.onContainerResize(board);
  });

  const handleZoomIn = useMemoizedFn(() => {
    ViewPortTransforms.updateZoom(board, Math.max(zoom / 1.1, MIN_ZOOM));
  });

  const handleZoomOut = useMemoizedFn(() => {
    ViewPortTransforms.updateZoom(board, Math.min(zoom * 1.1, MAX_ZOOM));
  });

  // 添加一个新方法，用于处理选中元素或所有元素的全览
  const handleFitElements = useMemoizedFn((e: any) => {
    // 阻止事件冒泡和默认行为
    e.stopPropagation();
    e.preventDefault();

    // 获取当前选中的元素
    const selectedElements = selection.selectedElements;

    console.log(
      "全览按钮被点击，选中元素数量:",
      selectedElements.length,
      "选中元素:",
      selectedElements,
    );

    // 确保我们使用的是当前的选中元素
    if (selectedElements && selectedElements.length > 0) {
      // 如果有选中的元素，则全览选中的元素
      console.log("全览选中的元素");
      ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true, [
        ...selectedElements,
      ]);
    } else {
      // 否则全览所有元素
      console.log("全览所有元素");
      ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true);
    }
  });

  const handleMouseDown = eventHandlerGenerator("onMouseDown");
  const handleMouseMove = eventHandlerGenerator("onMouseMove");
  const handleMouseUp = eventHandlerGenerator("onMouseUp");
  const handleMouseEnter = eventHandlerGenerator("onMouseEnter");
  const handleMouseLeave = eventHandlerGenerator("onMouseLeave");
  const handleContextMenu = eventHandlerGenerator("onContextMenu");
  const handleClick = eventHandlerGenerator("onClick");
  const handleDblClick = eventHandlerGenerator("onDblClick");
  const handleOnPointerDown = eventHandlerGenerator("onPointerDown");
  const { run: handleOnPointerMove } = useThrottleFn(
    eventHandlerGenerator("onPointerMove"),
    { wait: 25 },
  );
  const handleOnPointerUp = eventHandlerGenerator("onPointerUp");

  const handleGridVisibleChange = useMemoizedFn((visible: boolean) => {
    setGridVisible(visible);
  });

  const handleGridSizeChange = useMemoizedFn((size: number) => {
    setGridSize(size);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    BOARD_TO_CONTAINER.set(board, container);

    const handleKeyDown = eventHandlerGenerator("onKeyDown");
    const handleKeyUp = eventHandlerGenerator("onKeyUp");
    const handleGlobalMouseDown = eventHandlerGenerator("onGlobalMouseDown");
    const handleGlobalMouseUp = eventHandlerGenerator("onGlobalMouseUp");
    const handleOnWheel = eventHandlerGenerator("onWheel");
    const handleOnGlobalPointerDown = eventHandlerGenerator(
      "onGlobalPointerDown",
    );
    const handleOnGlobalPointerMove = eventHandlerGenerator(
      "onGlobalPointerMove",
    );
    const handleOnGlobalPointerUp = eventHandlerGenerator("onGlobalPointerUp");
    const handleOnPaste = eventHandlerGenerator("onPaste");
    const handleOnCopy = eventHandlerGenerator("onCopy");
    const handleOnCut = eventHandlerGenerator("onCut");

    document.addEventListener("paste", handleOnPaste);
    document.addEventListener("copy", handleOnCopy);
    document.addEventListener("cut", handleOnCut);

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    document.addEventListener("mousedown", handleGlobalMouseDown);
    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("wheel", handleOnWheel, {
      passive: false,
    });

    document.addEventListener("pointerdown", handleOnGlobalPointerDown);
    document.addEventListener("pointermove", handleOnGlobalPointerMove);
    document.addEventListener("pointerup", handleOnGlobalPointerUp);

    const observer = new ResizeObserver(handleContainerResize);
    observer.observe(container);

    // 为状态栏和全览按钮添加原生事件监听器
    const statusBar = statusBarRef.current;

    // 定义事件处理函数
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
      document.removeEventListener("wheel", handleOnWheel);
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

      // 确保在组件卸载时清除参考线
      board.clearRefLines();

      observer.disconnect();
      board.destroy();
    };
  }, [board, eventHandlerGenerator, handleContainerResize]);

  const lines = board.refLine.matchRefLines(15 / zoom);
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
            {!readonly && <Toolbar />}
            <svg
              ref={svgRef}
              width={"100%"}
              height={"100%"}
              viewBox={`${minX} ${minY} ${width} ${height}`}
            >
              <defs>
                <marker
                  id={`whiteboard-arrow`}
                  markerWidth={ARROW_SIZE}
                  markerHeight={ARROW_SIZE}
                  // 箭头太细了，盖不住底下的线，向左偏移一点
                  refX={ARROW_SIZE - 0.5}
                  refY={ARROW_SIZE / 2}
                  orient="auto-start-reverse"
                  markerUnits="strokeWidth"
                >
                  <path
                    d={`M0,0 L2,${ARROW_SIZE / 2} L0,${ARROW_SIZE} L${ARROW_SIZE},${ARROW_SIZE / 2} Z`}
                    fill={"context-stroke"}
                    strokeLinejoin="round"
                    strokeWidth={1}
                    stroke={"context-stroke"}
                  />
                </marker>
                {/* 开放式箭头 */}
                <marker
                  id={`whiteboard-open-arrow`}
                  markerWidth={ARROW_SIZE}
                  markerHeight={ARROW_SIZE}
                  refX={ARROW_SIZE - 0.5}
                  refY={ARROW_SIZE / 2}
                  orient="auto-start-reverse"
                  markerUnits="strokeWidth"
                >
                  <path
                    d={`M0,0 L${ARROW_SIZE},${ARROW_SIZE / 2} L0,${ARROW_SIZE}`}
                    fill={"none"}
                    strokeLinejoin="round"
                    strokeWidth={1}
                    stroke={"context-stroke"}
                  />
                </marker>
                {/* 闭合式箭头 */}
                <marker
                  id={`whiteboard-closed-arrow`}
                  markerWidth={ARROW_SIZE}
                  markerHeight={ARROW_SIZE}
                  refX={ARROW_SIZE - 0.5}
                  refY={ARROW_SIZE / 2}
                  orient="auto-start-reverse"
                  markerUnits="strokeWidth"
                >
                  <path
                    d={`M0,0 L${ARROW_SIZE},${ARROW_SIZE / 2} L0,${ARROW_SIZE} Z`}
                    fill={"context-stroke"}
                    strokeLinejoin="round"
                    strokeWidth={1}
                    stroke={"context-stroke"}
                  />
                </marker>
                {/* 菱形箭头 */}
                <marker
                  id={`whiteboard-diamond`}
                  markerWidth={ARROW_SIZE}
                  markerHeight={ARROW_SIZE}
                  refX={ARROW_SIZE}
                  refY={ARROW_SIZE / 2}
                  orient="auto-start-reverse"
                  markerUnits="strokeWidth"
                >
                  <path
                    d={`M${ARROW_SIZE / 2},0 L${ARROW_SIZE},${ARROW_SIZE / 2} L${ARROW_SIZE / 2},${ARROW_SIZE} L0,${ARROW_SIZE / 2} Z`}
                    fill={"context-stroke"}
                    strokeLinejoin="round"
                    strokeWidth={1}
                    stroke={"context-stroke"}
                  />
                </marker>
                {/* 圆形箭头 */}
                <marker
                  id={`whiteboard-circle`}
                  markerWidth={ARROW_SIZE}
                  markerHeight={ARROW_SIZE}
                  refX={ARROW_SIZE}
                  refY={ARROW_SIZE / 2}
                  orient="auto-start-reverse"
                  markerUnits="strokeWidth"
                >
                  <circle
                    cx={ARROW_SIZE / 2}
                    cy={ARROW_SIZE / 2}
                    r={ARROW_SIZE / 2}
                    fill={"context-stroke"}
                    stroke={"context-stroke"}
                  />
                </marker>
              </defs>
              <Grid visible={gridVisible} gridSize={gridSize} />
              <g>{board.renderElements(centerConnectArrows)}</g>
              <g>{board.renderElements(noneCenterConnectArrows)}</g>
              <g>
                <SelectArea />
              </g>
              <g>
                {lines.map((line) => (
                  <GradientLine
                    key={line.key}
                    gradientId={line.key}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    startColor="#43CBFF"
                    stopColor="#9708CC"
                    strokeWidth={2 / zoom}
                    strokeDasharray={`${5 / zoom}, ${5 / zoom}`}
                  />
                ))}
              </g>
            </svg>
            <div className={styles.verticalBar}>
              {!readonly && <AttributeSetter />}
            </div>
            <Flex
              ref={statusBarRef}
              className={styles.statusBar}
              gap={12}
              align={"center"}
              onDoubleClick={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <GridSettings
                onVisibleChange={handleGridVisibleChange}
                onSizeChange={handleGridSizeChange}
              />
              <Divider
                type="vertical"
                style={{ margin: "0 4px", height: "16px" }}
              />
              <Tooltip title="全览">
                <div
                  ref={fitViewButtonRef}
                  onClick={handleFitElements}
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FullscreenOutlined />
                </div>
              </Tooltip>
              <Divider
                type="vertical"
                style={{ margin: "0 4px", height: "16px" }}
              />
              <MinusOutlined onClick={handleZoomIn} />
              <Popover
                trigger={"click"}
                arrow={false}
                content={
                  <Flex vertical gap={4}>
                    <For
                      data={ZOOMS}
                      renderItem={(zoomValue) => (
                        <div
                          key={zoomValue}
                          className={styles.zoomItem}
                          onClick={() => {
                            ViewPortTransforms.updateZoom(board, zoomValue);
                          }}
                        >
                          {Math.round(zoomValue * 100)}%
                        </div>
                      )}
                    />
                  </Flex>
                }
                styles={{
                  body: {
                    padding: 4,
                    marginBottom: 12,
                  },
                }}
              >
                {Math.round(zoom * 100)}%
              </Popover>
              <PlusOutlined onClick={handleZoomOut} />
            </Flex>
          </ViewPortContext.Provider>
        </SelectionContext.Provider>
      </BoardContext.Provider>
    </div>
  );
});

export default WhiteBoard;

export * from "./types";
