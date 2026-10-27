import type { WhiteboardDocumentBinding } from "./document";
import { useWhiteboardPresence, type WhiteboardPresenceOptions } from "./collaboration/presence";
import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useMemoizedFn, useCreation, useThrottleFn } from "ahooks";
import { cn } from "@tau/ui";
import { createServiceRegistry, type ServiceRegistry } from "@tau/shared/service-registry";

import Board from "./Board";

import {
  BoardContext,
  SelectionContext,
  ViewPortContext,
  BoardStateContext,
  ArrowConnectPointOverlayContext,
  PointerViewportStoreContext,
  type PointerViewportStore,
} from "./context";
import {
  ARROW_CONNECT_PROXIMITY_HIDE_DELAY,
  ARROW_CONNECT_PROXIMITY_RADIUS,
  BOARD_TO_CONTAINER,
  DEFAULT_GRID_SIZE,
  FIT_VIEW_PADDING,
} from "./constants";
import { createConnectPointOwnerStore } from "./utils/ConnectPointOwner";
import { createWheelGestureHandler } from "./utils/wheelGesture";
import {
  BoardElement,
  Point,
  ViewPort,
  Selection,
  PresentationSequence,
  PluginContextMenuItem,
  PageSketch,
  DEFAULT_PAGE_SKETCH,
} from "./types";
import Toolbar from "./components/Toolbar";
import CreateToolHint from "./components/CreateToolHint";
import ReadonlyNotice from "./components/ReadonlyNotice";
import AttributeSetter from "./components/AttributeSetter";
import PresentationCreator from "./components/PresentationCreator";
import PresentationMode from "./components/PresentationMode";
import StatusBar from "./components/StatusBar";
import BoardContent from "./components/BoardContent";
import { CreationPreviewBadge } from "./components/CreationPreview";
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
  useCreateToolCursor,
} from "./hooks";
import ContextMenuLayer, {
  type ContextMenuItem,
  type BuildMenuItemsParams,
} from "./components/ContextMenuLayer";
import { ViewPortTransforms } from "./transforms";
import { BoardUtil, PointUtil } from "./utils";

import {
  ownsBoardEvent,
  claimBoardPointer,
  ownsBoardPointerEvent,
  releaseBoardPointer,
  releaseBoardPointers,
  finishBoardPointer,
  wasBoardPointerFinished,
  isCanvasOverlayEvent,
} from "./utils/events";
import { isEditableTarget } from "@tau/ui";
import type {
  WhiteboardExtension,
  WhiteboardExtensionError,
  WhiteboardOutline,
  WhiteboardSnapshot,
} from "./extensions/api";
import { WhiteboardAPIProvider } from "./extensions/context";
import { isDocumentVersionSupported } from "./document-version";

const simplifiedRenderZoomThreshold = 0.3;

export interface WhiteBoardProps {
  presence?: WhiteboardPresenceOptions;
  document?: WhiteboardDocumentBinding;
  extensions: readonly WhiteboardExtension[];
  outline?: WhiteboardOutline;
  className?: string;
  style?: React.CSSProperties;
  initData: BoardElement[] & { presentationSequences?: PresentationSequence[] };
  initViewPort?: ViewPort;
  initSelection?: Selection;
  initPresentationSequences?: PresentationSequence[];
  /** 页级画风（D-107），缺省为普通 */
  initSketch?: PageSketch;
  /** 加载的文档版本（getDocumentVersion(data)），缺省视为 1；高于支持范围时强制只读且不写回 */
  version?: number;
  readonly?: boolean;
  onChange?: (data: WhiteboardSnapshot) => void;
  showSidebar?: boolean;
  showToolbar?: boolean;
  showAttributeSetter?: boolean;
  showStatusBar?: boolean;
  /** 宿主追加在右下状态栏末尾的控件（如协作入口），演示模式下随状态栏隐藏 */
  statusBarEnd?: React.ReactNode;
  /** 进出演示模式（宿主页面据此收起画布外的浮动件，如页签条） */
  onPresentationModeChange?: (presenting: boolean) => void;
  /** 扩展被禁用时回调（命名空间违规、冲突、创建失败等），画布继续运行 */
  onExtensionError?: (error: WhiteboardExtensionError) => void;
  /** 宿主服务注册表：扩展经 requires/optional 声明后从扩展 api 获取；缺省为空注册表 */
  services?: ServiceRegistry;
  /** 宿主为特定扩展派生服务作用域；未提供时使用公共注册表。 */
  extensionServices?: (
    id: string,
    api: import("./extensions/api").WhiteboardAPI
  ) => ServiceRegistry;
}

const DEFAULT_PRESENTATION_SEQUENCES: PresentationSequence[] = [];
/** 未传 services 时的共享空注册表：无注册项，声明了 requires 的扩展会被拒绝装配 */
const EMPTY_SERVICE_REGISTRY = createServiceRegistry();
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
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (zoom: number) => void;
  /** 选中并滚入视野，派发 element:flash 让元素闪一下；元素不存在返回 false */
  revealElement: (id: string) => boolean;
}

/**
 * 画板生命周期：渲染期只构造无副作用的 Board，文档连接与扩展装配放在提交期，完成后才挂载画布。
 * 被丢弃的渲染（挂起、出错重试、StrictMode 双渲染）因此不会残留扩展实例或占用文档绑定；
 * 销毁由画布在容器真正脱离文档时执行（见 WhiteBoardCanvas 的容器 effect）。
 */
const WhiteBoard = memo(
  forwardRef<WhiteBoardRef, WhiteBoardProps>((props, ref) => {
    const {
      initData,
      initViewPort = DEFAULT_VIEW_PORT,
      initSelection = DEFAULT_SELECTION,
      initPresentationSequences = DEFAULT_PRESENTATION_SEQUENCES,
      initSketch = DEFAULT_PAGE_SKETCH,
      readonly,
      version,
      onExtensionError,
      extensions,
      services,
      extensionServices,
    } = props;
    const documentTooNew = !isDocumentVersionSupported(version ?? 1);
    const notifyExtensionError = useMemoizedFn((error: WhiteboardExtensionError) =>
      onExtensionError?.(error)
    );
    const board = useCreation<Board>(() => {
      const instance = new Board(
        initData,
        initViewPort,
        initSelection,
        [],
        initPresentationSequences,
        documentTooNew || readonly,
        initSketch
      );
      instance.readonlyReason = documentTooNew ? "document-too-new" : null;
      return instance;
    }, []);
    const initialDocument = useRef(props.document);
    if (props.document !== initialDocument.current)
      throw new Error("白板文档绑定必须稳定，换文档请重建画布");
    const initialExtensions = useRef(extensions);
    if (extensions !== initialExtensions.current) throw new Error("白板扩展集合必须稳定");

    const [installed, setInstalled] = useState(false);
    // StrictMode 与 Activity 会重跑本 effect：装配只做一次，清理时不拆除
    useLayoutEffect(() => {
      if (!board.extensions) {
        if (initialDocument.current) board.attachDocument(initialDocument.current);
        board.installExtensions(
          initialExtensions.current,
          notifyExtensionError,
          services ?? EMPTY_SERVICE_REGISTRY,
          extensionServices
        );
      }
      setInstalled(true);
      // 服务注册表与扩展集合一样只在装配时读取一次
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [board, notifyExtensionError]);

    if (!installed) return null;
    return <WhiteBoardCanvas ref={ref} {...props} board={board} />;
  })
);

const WhiteBoardCanvas = forwardRef<WhiteBoardRef, WhiteBoardProps & { board: Board }>(
  (props, ref) => {
    const {
      board,
      className,
      style,
      readonly,
      version,
      onChange,
      showSidebar = false,
      showToolbar,
      showAttributeSetter,
      showStatusBar = true,
      statusBarEnd,
      onPresentationModeChange,
      outline,
    } = props;

    // 文档版本过高时强制只读：工具栏/属性条一律隐藏，只留只读提示条
    const documentVersion = version ?? 1;
    const documentTooNew = !isDocumentVersionSupported(documentVersion);
    const toolbarVisible = !documentTooNew && (showToolbar ?? !readonly);
    const attributeSetterVisible = !documentTooNew && (showAttributeSetter ?? !readonly);

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
    const connectPointOwnerStore = useCreation(
      () =>
        createConnectPointOwnerStore({
          radius: ARROW_CONNECT_PROXIMITY_RADIUS,
          hideDelay: ARROW_CONNECT_PROXIMITY_HIDE_DELAY,
        }),
      []
    );
    useEffect(() => {
      const unsubscribe = pointerViewportStore.subscribe(() => {
        connectPointOwnerStore.setPointer(pointerViewportStore.getSnapshot());
      });
      return () => {
        unsubscribe();
        connectPointOwnerStore.dispose();
      };
    }, [connectPointOwnerStore, pointerViewportStore]);

    // 网格设置
    const peers = useWhiteboardPresence(board, pointerViewportStore, props.presence);
    const { gridVisible, handleGridVisibleChange } = useGridSettings();

    useEffect(() => {
      board.readonlyReason = documentTooNew ? "document-too-new" : null;
      board.readonly = documentTooNew || (readonly ?? false);
    }, [board, readonly, documentTooNew]);
    const isArrowMoving = useListenArrowMove(board);
    const { isMoving: isElementsMoving, movingStore } = useElementsMoving(board);
    const { markInteracting } = usePreventTextSelection(containerRef);
    const createToolCursor = useCreateToolCursor(board);

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
    const {
      handleContainerResize,
      handleZoomIn,
      handleZoomOut,
      handleZoomTo,
      handleFitAll,
      handleFitSelection,
    } = useViewPortControls(board, zoom);

    // 暴露 ref 方法
    useImperativeHandle(
      ref,
      () => ({
        fitAllElements: (padding = FIT_VIEW_PADDING, animate = true) => {
          ViewPortTransforms.fitAllElements(board, padding, animate);
        },
        getElements: () => board.extensions!.api.children,
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
    const { run: handleOnPointerMove, cancel: cancelPointerMove } = useThrottleFn(
      nonThrottledHandleOnPointerMove,
      {
        wait: 25,
      }
    );

    const setPointerViewport = useMemoizedFn((event: Pick<PointerEvent, "clientX" | "clientY">) => {
      const point = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
      pointerViewportStore.setPoint(point ?? null);
    });
    const clearPointerViewport = useMemoizedFn(() => {
      pointerViewportStore.setPoint(null);
    });

    const handleContainerPointerDown = useMemoizedFn(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!ownsBoardEvent(board, event.nativeEvent)) return;
        if (!claimBoardPointer(board, event.nativeEvent)) return;
        // 必须最先同步置位，拦截随后触发的 selectstart，防止拖拽/框选时误选 HTML 文字
        if (!isEditableTarget(event.target)) containerRef.current?.focus({ preventScroll: true });
        markInteracting(event.target);
        setPointerViewport(event);
        handleOnPointerDown(event);
      }
    );

    const handleContainerPointerMove = useMemoizedFn(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!ownsBoardPointerEvent(board, event.nativeEvent)) return;
        setPointerViewport(event);
        // 创建手势高频驱动（手写采样等）：绕过 25ms 节流，并取消挂起的节流调用避免旧位置晚到
        if (board.interactions.isCreateGestureActive()) {
          cancelPointerMove();
          nonThrottledHandleOnPointerMove(event);
          return;
        }
        handleOnPointerMove(event);
      }
    );

    const handleContainerPointerUp = useMemoizedFn((event: React.PointerEvent<HTMLDivElement>) => {
      if (!ownsBoardPointerEvent(board, event.nativeEvent)) return;
      cancelPointerMove();
      setPointerViewport(event);
      if (!wasBoardPointerFinished(event.nativeEvent)) handleOnPointerUp(event);
    });
    const handleContainerPointerLeave = useMemoizedFn(() => {
      clearPointerViewport();
    });
    const handleContainerPointerCancel = useMemoizedFn(() => {
      clearPointerViewport();
    });

    const handleOnWheel = useMemoizedFn((e: WheelEvent) => {
      // 画布内宿主浮层（阅读纸）自己滚动，不缩放 / 平移画布
      if (isCanvasOverlayEvent(e)) return;
      e.stopPropagation();
      e.preventDefault();
      noStopPropagationOnWheel(e);
    });

    // 监听数据变化；拖拽/键盘连续移动的手势帧（element:move 持续发）只记脏标，
    // 手势结束（element:move-end）统一取一次快照，避免高频帧反复组装快照并重置宿主的落库防抖。
    // 首个手势帧先于 element:move 到达时会漏抑制一次，属可接受的一次性开销。
    useEffect(() => {
      let inMoveGesture = false;
      let gestureDirty = false;
      const emitChange = () => {
        // 文档版本过高：视口/选区等查看性变化也不写回，避免旧版本数据覆盖新版本文档
        if (!documentTooNew && !board.document) onChange?.(board.extensions!.api.getSnapshot());
      };
      const handleChange = (payload?: { selectionOnly?: boolean }) => {
        if (inMoveGesture) {
          gestureDirty = true;
          return;
        }
        // 点选/框选是查看状态，不触发落库（selection 仍随下一次内容保存一并持久化）
        if (payload?.selectionOnly) return;
        emitChange();
      };
      const handleMove = () => {
        inMoveGesture = true;
      };
      const handleMoveEnd = () => {
        inMoveGesture = false;
        if (!gestureDirty) return;
        gestureDirty = false;
        emitChange();
      };
      board.on("change", handleChange);
      board.on("element:move", handleMove);
      board.on("element:move-end", handleMoveEnd);

      return () => {
        board.off("change", handleChange);
        board.off("element:move", handleMove);
        board.off("element:move-end", handleMoveEnd);
      };
    }, [board, onChange, documentTooNew]);
    useEffect(() => {
      const handleWindowBlur = () => {
        clearPointerViewport();
        board.interactions.cancel();
        board.snap.end();
        board.emit("element:move-end");
        releaseBoardPointers(board);
      };
      window.addEventListener("blur", handleWindowBlur);
      return () => {
        window.removeEventListener("blur", handleWindowBlur);
      };
    }, [board, clearPointerViewport]);

    useEffect(() => {
      board.snap.setGridSize(gridVisible ? DEFAULT_GRID_SIZE : null);
    }, [board, gridVisible]);

    // 设置容器，添加和清理事件监听器
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      BOARD_TO_CONTAINER.set(board, container);
      board.setActive(true);

      const scopedHandleOnPaste = (event: ClipboardEvent) => {
        if (ownsBoardEvent(board, event)) handleOnPaste(event);
      };
      document.addEventListener("paste", scopedHandleOnPaste);
      const scopedHandleOnCopy = (event: ClipboardEvent) => {
        if (ownsBoardEvent(board, event)) handleOnCopy(event);
      };
      document.addEventListener("copy", scopedHandleOnCopy);
      const scopedHandleOnCut = (event: ClipboardEvent) => {
        if (ownsBoardEvent(board, event)) handleOnCut(event);
      };
      document.addEventListener("cut", scopedHandleOnCut);

      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);

      const scopedHandleGlobalMouseDown = (event: MouseEvent) => {
        if (ownsBoardEvent(board, event)) handleGlobalMouseDown(event);
      };
      document.addEventListener("mousedown", scopedHandleGlobalMouseDown);
      const scopedHandleGlobalMouseUp = (event: MouseEvent) => {
        if (ownsBoardEvent(board, event)) handleGlobalMouseUp(event);
      };
      document.addEventListener("mouseup", scopedHandleGlobalMouseUp);

      const handleWheelGesture = createWheelGestureHandler(container, handleOnWheel);
      container.addEventListener("wheel", handleWheelGesture, {
        capture: true,
        passive: false,
      });

      const scopedHandleOnGlobalPointerDown = (event: PointerEvent) => {
        if (ownsBoardPointerEvent(board, event)) handleOnGlobalPointerDown(event);
      };
      document.addEventListener("pointerdown", scopedHandleOnGlobalPointerDown);
      const scopedHandleOnGlobalPointerMove = (event: PointerEvent) => {
        if (!ownsBoardPointerEvent(board, event)) return;
        if (!(event.target instanceof Node) || !container.contains(event.target)) {
          cancelPointerMove();
          setPointerViewport(event);
          nonThrottledHandleOnPointerMove(event);
        }
        handleOnGlobalPointerMove(event);
      };
      document.addEventListener("pointermove", scopedHandleOnGlobalPointerMove);
      const scopedHandleOnGlobalPointerUp = (event: PointerEvent) => {
        if (!ownsBoardPointerEvent(board, event)) return;
        cancelPointerMove();
        finishBoardPointer(event);
        try {
          handleOnPointerUp(event);
          handleOnGlobalPointerUp(event);
        } finally {
          releaseBoardPointer(board, event);
        }
      };
      document.addEventListener("pointerup", scopedHandleOnGlobalPointerUp, true);
      const scopedHandleOnGlobalPointerCancel = (event: PointerEvent) => {
        if (!ownsBoardPointerEvent(board, event)) return;
        cancelPointerMove();
        finishBoardPointer(event);
        try {
          handleOnGlobalPointerCancel(event);
          board.interactions.cancel();
          board.snap.end();
        } finally {
          releaseBoardPointer(board, event);
        }
      };
      document.addEventListener("pointercancel", scopedHandleOnGlobalPointerCancel, true);

      const observer = new ResizeObserver(() => {
        // 容器几何变化（窗口缩放/侧栏拖宽）时失效坐标缓存（见 Board.getContainerRect）
        board.invalidateContainerRect();
        handleContainerResize();
      });
      observer.observe(container);
      // 捕获任意滚动：容器可能随文档滚动移位而尺寸不变，此时缓存需失效
      const invalidateRect = () => board.invalidateContainerRect();
      window.addEventListener("scroll", invalidateRect, { capture: true, passive: true });

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
        document.removeEventListener("mousedown", scopedHandleGlobalMouseDown);
        document.removeEventListener("mouseup", scopedHandleGlobalMouseUp);
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("keyup", handleKeyUp);
        container.removeEventListener("wheel", handleWheelGesture, true);
        document.removeEventListener("pointerdown", scopedHandleOnGlobalPointerDown);
        document.removeEventListener("pointermove", scopedHandleOnGlobalPointerMove);
        document.removeEventListener("pointerup", scopedHandleOnGlobalPointerUp, true);
        document.removeEventListener("pointercancel", scopedHandleOnGlobalPointerCancel, true);
        document.removeEventListener("paste", scopedHandleOnPaste);
        document.removeEventListener("copy", scopedHandleOnCopy);
        document.removeEventListener("cut", scopedHandleOnCut);

        if (statusBar) {
          statusBar.removeEventListener("pointerdown", stopPropagation);
          statusBar.removeEventListener("pointerup", stopPropagation);
          statusBar.removeEventListener("mouseup", stopPropagation);
        }

        observer.disconnect();
        window.removeEventListener("scroll", invalidateRect, {
          capture: true,
        } as EventListenerOptions);
        cancelPointerMove();
        board.setActive(false);
        releaseBoardPointers(board);
        queueMicrotask(() => {
          if (!container.isConnected) {
            BOARD_TO_CONTAINER.delete(board);
            board.destroy();
          }
        });
      };
    }, [board, handleContainerResize]);

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

    return (
      <WhiteboardAPIProvider value={board.extensions!.api}>
        <BoardContext.Provider value={board}>
          <SelectionContext.Provider value={selection}>
            <ViewPortContext.Provider value={viewPort}>
              <ArrowMoveContext.Provider value={{ isMoving: isArrowMoving }}>
                <BoardStateContext.Provider
                  value={{
                    isMoving: isElementsMoving,
                    movingStore,
                    simplifiedRenderZoomThreshold,
                    connectPointOwnerStore,
                  }}
                >
                  <ArrowConnectPointOverlayContext.Provider value={connectPointOverlayRef}>
                    <PointerViewportStoreContext.Provider value={pointerViewportStore}>
                      <div className="relative flex h-full">
                        {/* 元素树停靠栏：纸面内左栏，开关在宿主页面的面包屑 */}
                        {showSidebar && !isPresentationMode && <Sidebar outline={outline} />}
                        <div
                          ref={containerRef}
                          data-whiteboard-root
                          tabIndex={0}
                          className={cn(
                            "[:fullscreen]:w-screen [:fullscreen]:h-screen [:fullscreen]:bg-surface relative h-full min-w-0 flex-1",
                            createToolCursor,
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
                            {toolbarVisible ? (
                              <Toolbar />
                            ) : documentTooNew ? (
                              <ReadonlyNotice />
                            ) : null}
                            {toolbarVisible && <CreateToolHint visible={toolbarVisible} />}

                            <BoardContent
                              ref={svgRef}
                              board={board}
                              viewPort={viewPort}
                              centerConnectArrows={centerConnectArrows}
                              noneCenterConnectArrows={noneCenterConnectArrows}
                              centerConnectAndSelectedArrows={centerConnectAndSelectedArrows}
                              isolateStaticSelection={isolateStaticSelection}
                              gridVisible={gridVisible}
                              connectPointOverlayRef={connectPointOverlayRef}
                              peers={peers}
                            />

                            <CreationPreviewBadge board={board} />

                            {attributeSetterVisible && <AttributeSetter />}
                          </div>

                          <PresentationCreator />
                          <PresentationMode />

                          {showStatusBar && (
                            <StatusBar
                              ref={statusBarRef}
                              gridVisible={gridVisible}
                              zoom={zoom}
                              sequences={board.presentationManager.sequences}
                              onGridVisibleChange={handleGridVisibleChange}
                              onZoomIn={handleZoomIn}
                              onZoomOut={handleZoomOut}
                              onZoomTo={handleZoomTo}
                              onFitAll={handleFitAll}
                              onFitSelection={handleFitSelection}
                              onStartPresentation={handleStartPresentation}
                              onEditSequence={handleEditSequence}
                              onDeleteSequence={handleDeleteSequence}
                              end={statusBarEnd}
                            />
                          )}

                          <ContextMenuLayer
                            board={board}
                            containerRef={containerRef}
                            readonly={readonly}
                            buildMenuItems={buildContextMenuItems}
                          />
                          {board.extensions!.renderLayers("canvas")}
                        </div>

                        {board.extensions!.renderLayers("outside")}
                      </div>
                    </PointerViewportStoreContext.Provider>
                  </ArrowConnectPointOverlayContext.Provider>
                </BoardStateContext.Provider>
              </ArrowMoveContext.Provider>
            </ViewPortContext.Provider>
          </SelectionContext.Provider>
        </BoardContext.Provider>
      </WhiteboardAPIProvider>
    );
  }
);

export default WhiteBoard;
export * from "./types";
