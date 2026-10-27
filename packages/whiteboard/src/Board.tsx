import React from "react";
import { ErrorBoundary, isEditableTarget } from "@tau/ui";
import { UnknownElement, type UnknownElementReason } from "./components/UnknownElement";
import EventEmitter from "eventemitter3";
import curry from "lodash/curry";
import SnapManager from "./utils/snap/SnapManager";
import { PresentationManager } from "./utils/PresentationManager";

import {
  Operation,
  Selection,
  Events,
  EventHandler,
  IBoardPlugin,
  BoardElement,
  ViewPort,
  PresentationSequence,
  ElementBounds,
  BoardContextMenuPayload,
  ContextMenuContext,
  PluginContextMenuItem,
  CustomOffset,
  PageSketch,
  DEFAULT_PAGE_SKETCH,
} from "./types";
import { isValid, executeSequence, BoardUtil, PathUtil } from "./utils";
import ViewportUtil from "./utils/ViewportUtil";

import BoardOperations from "./utils/BoardOperations";
import { CapabilityService } from "./services/CapabilityService";
import { InteractionManager } from "./interactions/InteractionManager";

import { BOARD_TO_CONTAINER } from "./constants/map";
import { SELECT_TOOL_ID, builtinCreateToolIds } from "./constants/tools";
import { createMindThemePreviewStore } from "./utils/MindThemePreviewStore";
import { ExtensionRuntime } from "./extensions/runtime";
import type {
  WhiteboardAPI,
  WhiteboardExtension,
  WhiteboardExtensionError,
} from "./extensions/api";
import type { ServiceRegistry } from "@tau/shared/service-registry";
import { WHITEBOARD_DOCUMENT_VERSION } from "./document-version";

import type { WhiteboardDocumentBinding } from "./document";
import { boardFlag } from "./constants/boardIdentity";
interface VisibleElementTree {
  element: BoardElement;
  children: VisibleElementTree[];
}

const bindHandler = curry((eventName: Events, plugin: IBoardPlugin): EventHandler | undefined => {
  if (plugin[eventName]) {
    return plugin[eventName]!.bind(plugin);
  }
});

class Board {
  static boardFlag = boardFlag;
  public document?: WhiteboardDocumentBinding;
  private disconnectDocument?: () => void;
  private projectingDocument = false;

  attachDocument(document: WhiteboardDocumentBinding): void {
    if (this.document) throw new Error("画布文档不能原位替换");
    if (this.undos.length || this.redos.length) throw new Error("已有本机历史不能隐式切换文档");
    this.document = document;
    this.undos = [];
    this.redos = [];
    try {
      this.disconnectDocument = document.connect(this);
    } catch (error) {
      this.document = undefined;
      throw error;
    }
  }

  publishDocument(
    children: BoardElement[],
    sketch?: PageSketch,
    sequences?: PresentationSequence[]
  ): void {
    this.projectingDocument = true;
    try {
      if (sketch && JSON.stringify(this.sketch) !== JSON.stringify(sketch)) {
        this.sketch = { ...sketch };
        this.emit("sketch:change", this.sketch);
      }
      if (sequences) this.presentationManager.publishSequences(sequences);
      this.submissionVersion++;
      this.replaceChildrenSilently(children);
      this.elementVersion++;
      this.emit("value:change", children);
      this.emit("change", { source: "projection" });
    } finally {
      this.projectingDocument = false;
    }
  }

  private plugins: IBoardPlugin[] = [];
  private eventEmitter: EventEmitter;
  public snap: SnapManager;
  public capabilityService: CapabilityService;
  public interactions: InteractionManager;
  public mindThemePreviewStore = createMindThemePreviewStore();
  private active = true;
  public extensions?: ExtensionRuntime;
  private historyGroup: string | undefined;
  /** undo/redo 重放标记：重放历史操作不进提交校验（数据提交时已校验过） */
  private replayingHistory = false;
  installExtensions(
    extensions: readonly WhiteboardExtension[],
    onExtensionError?: (error: WhiteboardExtensionError) => void,
    services?: ServiceRegistry,
    extensionServices?: (id: string, api: WhiteboardAPI) => ServiceRegistry
  ) {
    if (this.extensions) throw new Error("白板扩展集合不能在运行中替换");
    this.extensions = new ExtensionRuntime(
      this,
      extensions,
      onExtensionError,
      services,
      extensionServices
    );
  }

  /** 替换 children 并重建快照与选区引用，不进 undo 历史、不 emit change */
  replaceChildrenSilently(children: BoardElement[]) {
    this.children = children;
    // selection.selectedElements 持有的是元素快照，children 替换后需重新绑定，避免旧字段被写回
    const selectedElements = this.selection?.selectedElements;
    if (selectedElements?.length) {
      const selectedIds = new Set(selectedElements.map(element => element?.id).filter(isValid));
      if (selectedIds.size > 0) {
        const resolved = new Map<string, BoardElement>();
        const stack = [...this.children];
        while (stack.length > 0 && resolved.size < selectedIds.size) {
          const current = stack.pop() as BoardElement;
          if (selectedIds.has(current.id)) resolved.set(current.id, current);
          const childElements = current.children;
          if (Array.isArray(childElements) && childElements.length > 0)
            stack.push(...childElements);
        }
        this.selection = {
          ...this.selection,
          selectedElements: selectedElements
            .map(element => resolved.get(element.id))
            .filter(isValid),
        };
      }
    }
    this.snapshot = {
      children: this.children,
      selection: this.selection,
      viewPort: this.viewPort,
      presentationSequences: this.presentationManager.sequences,
      sketch: this.sketch,
      version: WHITEBOARD_DOCUMENT_VERSION,
    };
  }
  private submissionVersion = 0;
  private removedElementVersions = new Map<string, number>();
  setActive(active: boolean) {
    if (this.active !== active) this.submissionVersion++;
    this.active = active;
    this.extensions?.setActive(active);
    if (!active) {
      this.isEditingElements = [];
      this.interactions.cancel();
      this.snap.end();
      this.emit("element:move-end");
    }
  }
  captureSubmission(element?: BoardElement) {
    const version = this.submissionVersion;
    const elementVersion = element ? (this.removedElementVersions.get(element.id) ?? 0) : 0;
    return () =>
      !this.isDestroyed &&
      !this.projectingDocument &&
      !this.presentationManager.isPresentationMode &&
      this.active &&
      !this.readonly &&
      version === this.submissionVersion &&
      (!element ||
        ((this.removedElementVersions.get(element.id) ?? 0) === elementVersion &&
          BoardUtil.getElementById(this, element.id)?.type === element.type));
  }
  public getFontSize() {
    const root = BOARD_TO_CONTAINER.get(this);
    return root ? parseFloat(getComputedStyle(root).fontSize) || 13 : 13;
  }

  public presentationManager: PresentationManager;
  public boardFlag: typeof boardFlag;
  public isDestroyed: boolean;
  public children: BoardElement[];
  public viewPort: ViewPort;
  public selection: Selection;
  /** 页级画风（D-107）；变化时 emit("sketch:change") */
  public sketch: PageSketch;
  public undos: Array<Operation[]>;
  public redos: Array<Operation[]>;
  public isEditingElements: string[] = [];
  private lastUndoTimestamp = 0; // 记录上次创建新 undo entry 的时间戳
  private elementVersion = 0;
  private containerRectCache: { x: number; y: number } | null = null;

  /**
   * 容器视口矩形（缓存）：指针热路径（每次 pointermove 的坐标转换）高频读取，
   * getBoundingClientRect 在上一帧 DOM 写入后会把整文档强制重排（大页面百 ms 级）。
   * 平移/手势期间容器几何不变，缓存恒命中；布局变化经 invalidateContainerRect 失效
   * （容器 ResizeObserver 与窗口滚动捕获，见 WhiteBoard 接线）。
   */
  getContainerRect(): { x: number; y: number } | null {
    const container = BOARD_TO_CONTAINER.get(this);
    if (!container) return null;
    if (!this.containerRectCache) {
      const { x, y } = container.getBoundingClientRect();
      this.containerRectCache = { x, y };
    }
    return this.containerRectCache;
  }

  invalidateContainerRect(): void {
    this.containerRectCache = null;
  }
  /** 剔除滞回的上一轮保留集合（见 filterElementsInViewport 的宽退出盒说明） */
  private cullRetainedIds = new Set<string>();
  private snapshot: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences: PresentationSequence[];
    sketch: PageSketch;
    version: number;
  };

  /** 当前工具（"tau.select" 表示非创建模式） */
  private _activeTool: string = SELECT_TOOL_ID;
  private _activeToolOptions: Readonly<Record<string, unknown>> | null = null;

  /**
   * 创建手势的预览覆盖层状态：预览元素从不进入 children、快照、onChange 与历史；
   * 变化时 emit("internal:creation-preview-change")。leaving 表示取消退场中（120ms 后清空）。
   */
  public creationPreview: {
    element: BoardElement;
    highlight: readonly string[];
    leaving: boolean;
    /** 尺寸徽标文本（drag 已移动时由内核计算，line 约束显示长度） */
    sizeLabel?: string;
    /** 是否绘制包围盒描边（手写笔迹等传 false） */
    bounds: boolean;
  } | null = null;

  /** 设置/清除创建预览；element 为 null 时清除 */
  setCreationPreview(
    element: BoardElement | null,
    options?: { highlight?: readonly string[]; sizeLabel?: string; bounds?: boolean }
  ): void {
    if (!element) {
      if (this.creationPreview) {
        this.creationPreview = null;
        this.emit("internal:creation-preview-change");
      }
      return;
    }
    this.creationPreview = {
      element,
      highlight: options?.highlight ?? [],
      leaving: false,
      sizeLabel: options?.sizeLabel,
      bounds: options?.bounds ?? true,
    };
    this.emit("internal:creation-preview-change");
  }

  /** 标记预览进入取消退场（渲染层播放 120ms 淡出） */
  markCreationPreviewLeaving(): void {
    if (!this.creationPreview || this.creationPreview.leaving) return;
    this.creationPreview = { ...this.creationPreview, leaving: true };
    this.emit("internal:creation-preview-change");
  }

  constructor(
    children: BoardElement[],
    viewPort: ViewPort,
    selection: Selection,
    plugins: IBoardPlugin[] = [],
    presentationSequences: PresentationSequence[] = [],
    readonly = false,
    sketch: PageSketch = DEFAULT_PAGE_SKETCH
  ) {
    this.boardFlag = boardFlag;
    this.isDestroyed = false;
    this.children = children;
    this.eventEmitter = new EventEmitter();
    this.viewPort = viewPort;
    this.selection = selection;
    this.sketch = sketch;
    this.undos = [];
    this.redos = [];
    this.snapshot = {
      children: this.children,
      viewPort: this.viewPort,
      selection: this.selection,
      presentationSequences: presentationSequences,
      sketch: this.sketch,
      version: WHITEBOARD_DOCUMENT_VERSION,
    };

    this.initPlugins(plugins);

    // 初始化能力查询服务
    this.capabilityService = new CapabilityService(this);

    // 初始化交互内核（手势裁决与路由）
    this.interactions = new InteractionManager(this);

    // 初始化演示管理器和序列
    this.presentationManager = new PresentationManager(this, presentationSequences);
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.snap = new SnapManager(this);
    this._readonly = readonly;
  }

  // 只读属性
  private _readonly = false;
  /** 文档版本过高导致的强制只读原因；普通只读为 null。宿主（WhiteBoard 组件）负责设置。 */
  public readonlyReason: "document-too-new" | null = null;

  get readonly(): boolean {
    return this._readonly;
  }

  set readonly(value: boolean) {
    if (value && value !== this._readonly) {
      if (this.document) {
        this.interactions.cancel();
        this.document.endGesture(false);
      } else this.interactions.cancelResize();
    }
    if (value !== this._readonly) this.submissionVersion++;
    this._readonly = value;
    this.emit("readonly:change", value);
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.off(event, listener);
  }

  emit(event: string, ...args: any[]) {
    for (const listener of this.eventEmitter.listeners(event)) {
      try {
        const result: unknown = listener(...args);
        if (result instanceof Promise) {
          void result.catch(error => console.error(`白板事件 ${event} 监听器失败`, error));
        }
      } catch (error) {
        console.error(`白板事件 ${event} 监听器失败`, error);
      }
    }
  }

  once(event: string, listener: (...args: any[]) => void) {
    const once = (...args: any[]) => {
      this.off(event, once);
      listener(...args);
    };
    this.on(event, once);
  }

  destroy() {
    this.disconnectDocument?.();
    this.disconnectDocument = undefined;
    if (this.isDestroyed) return;
    this.interactions.cancelResize();
    this.isDestroyed = true;
    this.extensions?.dispose();
    this.plugins.forEach(plugin => plugin.dispose?.());
    this.snap.dispose();
    this.interactions.destroy();
    this.eventEmitter.removeAllListeners();
    this.plugins = [];
  }

  initPlugins(plugins: IBoardPlugin[]) {
    if (this.isDestroyed) return;
    // 将名称重复的去掉，使用最新的
    plugins.forEach(plugin => {
      const index = this.plugins.findIndex(p => p.name === plugin.name);
      if (index !== -1) {
        this.plugins[index] = plugin;
      }
    });
    const newPlugins = plugins.filter(plugin => !this.plugins.some(p => p.name === plugin.name));
    this.plugins.push(...newPlugins);
  }

  addPlugin(plugin: IBoardPlugin) {
    if (this.isDestroyed) return;
    // 如果已经存在，替换
    const index = this.plugins.findIndex(p => p.name === plugin.name);
    if (index !== -1) {
      this.plugins[index] = plugin;
    } else {
      this.plugins.push(plugin);
    }
    this.capabilityService?.clearCache(plugin.name);
  }

  isHit(element: BoardElement, x: number, y: number): boolean {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (!plugin) {
      const bounds = this.getBounds(element);
      return (
        !!bounds && x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
      );
    }
    return !!plugin.isHit?.(this, element, x, y);
  }

  moveElement(
    element: BoardElement,
    offsetX: number,
    offsetY: number
  ): BoardElement | null | undefined {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (!plugin)
      return {
        ...element,
        ...(Number.isFinite(element.x) ? { x: element.x + offsetX } : {}),
        ...(Number.isFinite(element.y) ? { y: element.y + offsetY } : {}),
        ...(element.children
          ? {
              children: element.children.map(
                child => this.moveElement(child, offsetX, offsetY) ?? child
              ),
            }
          : {}),
      } as BoardElement;
    return plugin.moveElement?.(this, element, offsetX, offsetY);
  }

  getBounds(element: BoardElement): ElementBounds | null {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (plugin?.getBounds) {
      return plugin.getBounds(this, element);
    }

    const { x, y, width, height } = element as BoardElement & {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };

    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof width === "number" &&
      typeof height === "number"
    ) {
      return {
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height,
      };
    }

    return null;
  }

  onMouseDown(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onMouseDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalMouseDown(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onGlobalMouseDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onMouseMove(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onMouseMove")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onMouseUp(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onMouseUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalMouseUp(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onGlobalMouseUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onMouseLeave(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onMouseLeave")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onMouseEnter(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onMouseEnter")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onClick(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onClick")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onDblClick(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onDblClick")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onContextMenu(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler("onContextMenu")).filter(isValid);
    executeSequence(fns, event, this);
  }

  // 聚合所有插件的右键菜单项
  getContextMenu(context: BoardContextMenuPayload): PluginContextMenuItem[] {
    const fullContext: ContextMenuContext = { ...context, board: this };
    const allItems: PluginContextMenuItem[] = [];
    this.extensions?.beginMenu();

    for (const plugin of this.plugins) {
      if (plugin.getContextMenu) {
        const items = plugin.getContextMenu(fullContext);
        allItems.push(
          ...(this.extensions ? this.extensions.registerMenu(plugin.name, items) : items)
        );
      }
    }

    for (const { value } of this.extensions?.entries ?? []) {
      for (const menu of value.menus ?? []) {
        if (menu.when && !menu.when(this.extensions!.api)) continue;
        allItems.push({
          key: menu.id,
          label: menu.label,
          priority: menu.order,
          onSelect: () => {
            void this.extensions!.execute(menu.command, context).catch(() => {});
          },
        });
      }
    }
    return allItems.sort((a, b) => a.priority - b.priority);
  }

  onWheel(event: WheelEvent) {
    const fns = this.plugins.map(bindHandler("onWheel")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.isComposing || (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)))
      return;
    if (this.extensions?.onKeyDown(event)) return;
    if (this.interactions.routeKeyDown(event)) return;
    if (this.exitCreateToolOnEscape(event)) return;
    const fns = this.plugins.map(bindHandler("onKeyDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  /**
   * Esc 只承担退出创建模式（浮层退场语义之外无其它角色）。让位规则：
   * 输入法组合在 onKeyDown 入口已让位；元素编辑中、演示态与编辑上下文
   * （输入框/可编辑节点）让位；portal 浮层的事件本就不归属画布（ownsBoardEvent），
   * 天然优先于本处理。
   */
  private exitCreateToolOnEscape(event: KeyboardEvent): boolean {
    if (event.key !== "Escape") return false;
    if (
      !this.isCreating() ||
      this.isEditingElements.length > 0 ||
      this.presentationManager.isPresentationMode ||
      this.presentationManager.isCreatingSequence ||
      isEditableTarget(event.target)
    )
      return false;
    event.preventDefault();
    event.stopPropagation();
    this.setActiveTool(SELECT_TOOL_ID);
    return true;
  }

  onKeyUp(event: KeyboardEvent) {
    if (this.interactions.routeKeyUp(event)) return;
    const fns = this.plugins.map(bindHandler("onKeyUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerDown(event: PointerEvent) {
    // 创建型工具最优先接管：整个创建手势不进入 claimed gesture、插件广播与常规手势
    if (this.interactions.tryStartCreateGesture(event)) return;
    // 元素类型自定义手势优先（原插件 return false 抢占的显式化）
    if (this.interactions.tryStartClaimedGesture(event)) return;
    const fns = this.plugins.map(bindHandler("onPointerDown")).filter(isValid);
    // 广播未被插件中断时，交互内核才有机会接管本次手势（双轨：未接管路径行为不变）
    if (executeSequence(fns, event, this)) {
      this.interactions.tryStartPointerGesture(event);
    }
  }

  onPointerUp(event: PointerEvent) {
    if (this.interactions.routePointerUp(event)) return;
    const fns = this.plugins.map(bindHandler("onPointerUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerMove(event: PointerEvent) {
    if (this.interactions.routePointerMove(event)) return;
    const fns = this.plugins.map(bindHandler("onPointerMove")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerDown(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler("onGlobalPointerDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerUp(event: PointerEvent) {
    if (this.interactions.routeGlobalPointerUp(event)) return;
    const fns = this.plugins.map(bindHandler("onGlobalPointerUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerMove(event: PointerEvent) {
    if (this.interactions.routeGlobalPointerMove(event)) return;
    const fns = this.plugins.map(bindHandler("onGlobalPointerMove")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerCancel(event: PointerEvent) {
    if (this.interactions.routeGlobalPointerCancel(event)) return;
    const fns = this.plugins.map(bindHandler("onGlobalPointerCancel")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPaste(event: ClipboardEvent) {
    if (this.readonly) return;
    if (this.extensions?.ingest("paste", event)) return;
    const fns = this.plugins.map(bindHandler("onPaste")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onCopy(event: ClipboardEvent) {
    const fns = this.plugins.map(bindHandler("onCopy")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onCut(event: ClipboardEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onCut")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onDrop(event: DragEvent) {
    if (this.readonly) return;
    if (this.extensions?.ingest("drop", event)) return;
    const fns = this.plugins.map(bindHandler("onDrop")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onDragOver(event: DragEvent) {
    if (this.readonly) return;
    if (this.extensions?.acceptsDrop(event)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      return;
    }
    const fns = this.plugins.map(bindHandler("onDragOver")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onDragEnter(event: DragEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onDragEnter")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onDragLeave(event: DragEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onDragLeave")).filter(isValid);
    executeSequence(fns, event, this);
  }

  /** 内部操作的唯一历史入口，缩放预览结束后也通过此入口提交。 */
  recordHistory(processedOps: Operation[], historyGroup?: string) {
    if (!processedOps.length) return;
    if (this.document) {
      this.document.commitPreview(processedOps, historyGroup);
      return;
    }
    const currentTimestamp = Date.now();
    const timeDiff = currentTimestamp - this.lastUndoTimestamp;

    // 如果距离上次创建新 undo entry 小于 1 秒，且 undos 不为空，则合并到最后一个 undo entry
    if (
      this.undos.length > 0 &&
      (historyGroup !== undefined
        ? historyGroup === this.historyGroup
        : this.historyGroup === undefined && timeDiff < 1000)
    ) {
      // 将操作添加到最后一个 undo entry
      const lastUndoEntry = this.undos[this.undos.length - 1];
      lastUndoEntry.push(...processedOps);
    } else {
      // 创建新的 undo entry
      this.undos.push(processedOps);
      this.lastUndoTimestamp = currentTimestamp;
    }
    this.historyGroup = historyGroup;

    if (this.undos.length > 100) {
      this.undos.shift();
    }
    this.redos = [];
  }

  apply(ops: Operation | Operation[], updateHistory = true, historyGroup?: string) {
    if (!Array.isArray(ops)) {
      ops = [ops];
    }

    if (this.isDestroyed) return;
    if (ops.length === 0) return;
    if (this.document) {
      if (this.projectingDocument) return;
      if (this.document.apply(ops, updateHistory, historyGroup)) return;
      updateHistory = false;
    }
    const resize = this.interactions?.resizePreview;
    if (resize) {
      resize.validate(ops);
      updateHistory = false;
    } else if (this.interactions?.hasResizeConflict(ops)) {
      if (this.interactions?.cancelResize()) {
        // 调用方的旧值来自预览帧，回退后按真实节点重取，避免撤销删除复活半成品。
        ops = ops.map(op => {
          if (op.type !== "remove_node" && op.type !== "set_node") return op;
          const node = PathUtil.getElement(this.children, op.path);
          if (!node) return op;
          return op.type === "remove_node"
            ? { ...op, node }
            : {
                ...op,
                properties: Object.fromEntries(
                  Object.keys(op.newProperties).map(key => [key, node[key]])
                ),
              };
        });
      }
    }
    const submittedOps = ops;

    // 使用抽离的核心逻辑进行操作应用
    const result = BoardOperations.applyOperations(
      {
        children: this.children,
        viewPort: this.viewPort,
        selection: this.selection,
        sketch: this.sketch,
      },
      submittedOps,
      {
        readonly: this.readonly,
      }
    );

    const { data, metadata, operations: executedOps } = result;

    // 执行结果上校验第三方元素 data（引用比较，天然覆盖 insert/set/move 混排）；
    // 不合规抛 WhiteboardValidationError，此时尚未提交任何状态，整批不应用（原子）。
    // undo/redo 重放（replayingHistory）不校验；其余调用（含 updateHistory=false 的内部提交）均校验
    if (this.extensions && !this.replayingHistory) {
      this.extensions.validateChangedElements(this.children, data.children);
    }

    // 如果没有变化，直接返回
    if (!metadata.hasChanges) {
      return;
    }
    resize?.record(executedOps, this.children, data.children);

    const hasElementMutation = executedOps.some(op =>
      ["set_node", "insert_node", "remove_node", "move_node"].includes(op.type)
    );
    const hasViewPortMutation = executedOps.some(op => op.type === "set_viewport");
    const hasSelectionMutation = executedOps.some(op => op.type === "set_selection");
    const hasSketchMutation = executedOps.some(op => op.type === "set_sketch");
    const hasSelectedElementsToRebind = Boolean(
      hasElementMutation && data.selection?.selectedElements?.length
    );

    // 重要：selection.selectedElements 存的是元素快照对象，children 变化（尤其是 undo/redo）后会变“陈旧”。
    // 如果不把 selection 重新绑定到最新 children 上，后续属性面板/样式修改会把陈旧的 x/y 等字段写回去，
    // 造成“结构正确但位置跳回去”的错觉。
    if (hasSelectedElementsToRebind && data.selection?.selectedElements?.length) {
      const selectedIds = data.selection.selectedElements.map(el => el?.id).filter(isValid);
      if (selectedIds.length > 0) {
        const idSet = new Set(selectedIds);
        const resolved = new Map<string, BoardElement>();
        const stack: BoardElement[] = [...data.children];

        while (stack.length > 0 && resolved.size < idSet.size) {
          const current = stack.pop() as BoardElement;
          if (idSet.has(current.id)) {
            resolved.set(current.id, current);
          }
          const childElements = current.children;
          if (Array.isArray(childElements) && childElements.length > 0) {
            for (let i = 0; i < childElements.length; i++) {
              stack.push(childElements[i]);
            }
          }
        }

        data.selection.selectedElements = selectedIds.map(id => resolved.get(id)).filter(isValid);
      }
    }
    if (hasElementMutation) {
      this.elementVersion += 1;
    }

    // 更新 Board 状态（显式不可变替换）
    let changed = false;
    let childrenChanged = false;
    let viewPortChanged = false;
    let selectionChanged = false;
    let sketchChanged = false;

    // 更新 children：由执行过的元素操作驱动，避免 JSON.stringify 大对象比较。
    if (hasElementMutation && data.children !== this.children) {
      this.children = data.children;
      changed = true;
      childrenChanged = true;
    }

    // 更新viewPort
    if (hasViewPortMutation && data.viewPort && data.viewPort !== this.viewPort) {
      this.viewPort = data.viewPort;
      changed = true;
      viewPortChanged = true;
    }

    // 更新selection
    if (
      (hasSelectionMutation || hasSelectedElementsToRebind) &&
      data.selection &&
      data.selection !== this.selection
    ) {
      this.selection = data.selection;
      changed = true;
      selectionChanged = true;
    }

    if (hasSketchMutation && data.sketch && data.sketch !== this.sketch) {
      this.sketch = data.sketch;
      changed = true;
      sketchChanged = true;
    }

    if (updateHistory && !this.document) {
      const processedOps =
        executedOps.length > 0 ? executedOps : BoardOperations.preprocessOperations(submittedOps);
      this.recordHistory(processedOps, historyGroup);
    }

    if (metadata.removedElements.length > 0) {
      const removedIds = new Set(metadata.removedElements.map(element => element.id));
      this.isEditingElements = this.isEditingElements.filter(id => !removedIds.has(id));
    }

    // 先发布完整快照，再通知观察者，监听器不能截断提交。
    if (changed) {
      this.snapshot = {
        children: this.children,
        selection: this.selection,
        viewPort: this.viewPort,
        presentationSequences: this.presentationManager.sequences,
        sketch: this.sketch,
        version: WHITEBOARD_DOCUMENT_VERSION,
      };
    }
    // 发出事件
    try {
      if (childrenChanged) {
        this.emit("value:change", this.children);
      }
      if (viewPortChanged) {
        this.emit("viewport:change", this.viewPort);
      }
      if (selectionChanged) {
        this.emit("selection:change", this.selection);
      }
      if (sketchChanged) {
        this.emit("sketch:change", this.sketch);
      }

      if (metadata.changedElements.length > 0) {
        this.emit("element:change", metadata.changedElements);
      }
      if (metadata.insertedElements.length > 0) {
        this.emit("element:insert", metadata.insertedElements);
      }
      if (metadata.removedElements.length > 0) {
        const removed = [...metadata.removedElements];
        while (removed.length) {
          const element = removed.pop()!;
          this.removedElementVersions.set(
            element.id,
            (this.removedElementVersions.get(element.id) ?? 0) + 1
          );
          if (element.children) removed.push(...element.children);
        }
        this.emit("element:remove", metadata.removedElements);
      }

      if (changed) {
        this.snapshot = {
          children: this.children,
          selection: this.selection,
          viewPort: this.viewPort,
          presentationSequences: this.presentationManager.sequences,
          sketch: this.sketch,
          version: WHITEBOARD_DOCUMENT_VERSION,
        };
        // 仅选区变化是查看状态：快照照常发布（渲染订阅者需更新），
        // 落库通知方（onChange）据此跳过，避免点选/框选触发全文档保存。
        this.emit("change", {
          selectionOnly: selectionChanged && !childrenChanged && !viewPortChanged && !sketchChanged,
        });
      }
    } catch (e) {
      console.error("Board apply error:", e);
    }
  }

  isElementSelected(element: BoardElement, selectArea?: Selection["selectArea"]): boolean {
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    if (!plugin?.isElementSelected && selectArea) {
      const bounds = this.getBounds(element);
      return (
        !!bounds &&
        bounds.minX <= Math.max(selectArea.anchor.x, selectArea.focus.x) &&
        bounds.maxX >= Math.min(selectArea.anchor.x, selectArea.focus.x) &&
        bounds.minY <= Math.max(selectArea.anchor.y, selectArea.focus.y) &&
        bounds.maxY >= Math.min(selectArea.anchor.y, selectArea.focus.y)
      );
    }
    return plugin?.isElementSelected?.(this, element, selectArea) ?? false;
  }

  renderElement(element: BoardElement): React.ReactElement | null | undefined {
    const { children } = element;
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    if (!plugin) {
      const unknown = this.extensions?.unknownElementReason(element);
      return (
        <UnknownElement
          key={element.id}
          element={element}
          reason={unknown?.reason}
          extensionId={unknown?.extensionId}
        >
          {this.renderElements(children)}
        </UnknownElement>
      );
    }

    // 折叠等渲染期过滤由元素的 render 能力决定
    const visibleChildren = children
      ? this.capabilityService.getVisibleChildren(element, children)
      : children;

    return this.renderPluginElement(
      plugin,
      element,
      this.renderElements(visibleChildren).filter(isValid)
    );
  }

  renderPluginElement(plugin: IBoardPlugin, element: BoardElement, children: React.ReactElement[]) {
    const unknown = this.extensions?.unknownElementReason(element);
    // 作者 render 缺失或返回空：按扩展判定原因占位；render 抛错被兜底时固定 error
    const render = (reason?: UnknownElementReason) => (
      <UnknownElement
        element={element}
        reason={reason ?? unknown?.reason}
        extensionId={unknown?.extensionId}
      >
        {children}
      </UnknownElement>
    );
    if (unknown) return <React.Fragment key={element.id}>{render()}</React.Fragment>;
    try {
      return (
        <ErrorBoundary
          key={element.id}
          fallback={render("error")}
          onError={error =>
            console.error(
              `白板扩展 ${this.extensions?.ownerOf(plugin.name) ?? plugin.name} 的元素 ${element.id} 失败`,
              error
            )
          }
        >
          {plugin.render?.(this, { element, children }) ?? render()}
        </ErrorBoundary>
      );
    } catch (error) {
      console.error(`白板元素扩展 ${plugin.name} 渲染失败`, error);
      return <React.Fragment key={element.id}>{render("error")}</React.Fragment>;
    }
  }

  renderElements(value?: BoardElement[]) {
    if (!value) return [];
    return value.map(element => this.renderElement(element));
  }

  getArrowBindPoint(element: BoardElement, connectId: string, customOffset?: CustomOffset) {
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    return plugin?.getArrowBindPoint?.(this, element, connectId, customOffset) ?? null;
  }

  undo() {
    if (this.interactions.cancelResize()) return;
    if (this.readonly) return;
    if (this.document) {
      this.document.undo();
      return;
    }
    if (this.undos.length === 0) return;
    const undo = this.undos.pop();
    if (!undo) return;
    const inverseOps = undo.map(item => BoardUtil.inverseOperation(item)).reverse();

    inverseOps.forEach(op => BoardOperations.markAsNormalized(op));
    this.replayingHistory = true;
    try {
      this.apply(inverseOps, false);
    } finally {
      this.replayingHistory = false;
    }
    this.redos.push(undo);
  }

  redo() {
    if (this.interactions.cancelResize()) return;
    if (this.readonly) return;
    if (this.document) {
      this.document.redo();
      return;
    }
    if (this.redos.length === 0) return;
    const redo = this.redos.pop();
    if (!redo) return;
    redo.forEach(op => BoardOperations.markAsNormalized(op));
    this.replayingHistory = true;
    try {
      this.apply(redo, false);
    } finally {
      this.replayingHistory = false;
    }
    this.undos.push(redo);
  }

  subscribe(callback: () => void) {
    this.on("change", callback);

    return () => {
      this.off("change", callback);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  getElementVersion() {
    return this.elementVersion;
  }

  get activeTool(): string {
    return this._activeTool;
  }

  get activeToolOptions(): Readonly<Record<string, unknown>> | null {
    return this._activeToolOptions;
  }

  /** 是否处于创建模式（非"选择"工具激活） */
  isCreating(): boolean {
    return this._activeTool !== SELECT_TOOL_ID;
  }

  /**
   * 设置当前工具；id 必须是已注册工具 id 或 "tau.select"，否则抛错。
   * 只读画布下非 select 的设置被忽略并返回 false。未传 options 视为清空参数。
   */
  setActiveTool(id: string, options?: Record<string, unknown>): boolean {
    const registered =
      id === SELECT_TOOL_ID ||
      builtinCreateToolIds.has(id) ||
      (this.extensions?.tools.some(tool => tool.id === id) ?? false);
    if (!registered) throw new Error(`未注册的白板工具：${id}`);
    if (this._readonly && id !== SELECT_TOOL_ID) return false;
    this.applyToolChange(id, options ?? null);
    return true;
  }

  /** 写齐字段后统一发事件 */
  private applyToolChange(id: string, options: Readonly<Record<string, unknown>> | null) {
    this._activeTool = id;
    this._activeToolOptions = options;
    this.emit("active-tool:change", id, options);
  }

  // 获取插件实例
  public getPlugin<T extends IBoardPlugin>(name: string): T | undefined {
    return this.plugins.find(p => p.name === name) as T | undefined;
  }

  public filterElementsInViewport(
    elements: BoardElement[],
    expandPixels = 100
  ): VisibleElementTree[] {
    const vp = this.viewPort;
    // 剔除滞回：进入用紧盒（调用方缓冲），退出用宽盒（约半屏）。
    // 文档等重元素滑过剔除边界时若进出同盒，来回平移会反复卸载/重挂（首渲百 ms 级）；
    // 上一轮保留的元素直到离开宽盒才真正卸载，边界附近的小幅平移零重挂。
    const exitMargin = expandPixels > 0 ? Math.max(expandPixels * 3, vp.width * 0.5) : expandPixels;
    const previous = this.cullRetainedIds;
    const current = new Set<string>();

    const keepElement = (element: BoardElement): boolean => {
      const bounds = this.getBounds(element);
      if (!bounds) return true;
      const rect = {
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      };
      if (ViewportUtil.isRectInViewport(rect, vp, expandPixels)) return true;
      return previous.has(element.id) && ViewportUtil.isRectInViewport(rect, vp, exitMargin);
    };

    const visit = (nodes: BoardElement[]): VisibleElementTree[] => {
      const visited: VisibleElementTree[] = [];
      for (const element of nodes) {
        const visibleChildren =
          element.children && element.children.length > 0 ? visit(element.children) : [];

        if (keepElement(element) || visibleChildren.length > 0) {
          current.add(element.id);
          visited.push({ element, children: visibleChildren });
        }
      }
      return visited;
    };

    const trees = visit(elements);
    this.cullRetainedIds = current;
    return trees;
  }

  public renderVisibleElements(
    elements?: VisibleElementTree[]
  ): Array<React.ReactElement | null | undefined> {
    if (!elements) return [];
    // 元素统一经 memo 的 ElementHost 包装：视口/选区帧剔除与 JSX 包装重建时，
    // 子元素集合未变的子树按 props 浅比较整体 bail out（见 ElementHost 的比较函数）
    return elements
      .map(({ element, children }) => {
        const plugin = this.plugins.find(plugin => plugin.name === element.type);
        if (!plugin) {
          const unknown = this.extensions?.unknownElementReason(element);
          return (
            <UnknownElement
              key={element.id}
              element={element}
              reason={unknown?.reason}
              extensionId={unknown?.extensionId}
            >
              {this.renderVisibleElements(children)}
            </UnknownElement>
          );
        }

        // 折叠等渲染期过滤由元素的 render 能力决定
        const processedChildren =
          children && children.length > 0
            ? this.capabilityService
                .getVisibleChildren(
                  element,
                  children.map(({ element: childElement }) => childElement)
                )
                .map(childElement => ({
                  element: childElement,
                  children:
                    children.find(child => child.element.id === childElement.id)?.children ?? [],
                }))
            : children;

        const renderedChildren = this.renderVisibleElements(processedChildren).filter(isValid);

        return (
          <ElementHost
            key={element.id}
            board={this}
            plugin={plugin}
            element={element}
            children={renderedChildren}
          />
        );
      })
      .filter(isValid);
  }
}

/**
 * 元素渲染宿主：视口剔除/选区分层每帧重建包装 JSX 时，元素与子元素集合未变
 * （element 引用经不可变树稳定）的子树在此短路，不再逐帧重渲整棵元素树。
 */
const ElementHost = React.memo(
  function ElementHost({
    board,
    plugin,
    element,
    children,
  }: {
    board: Board;
    plugin: IBoardPlugin;
    element: BoardElement;
    children: React.ReactNode;
  }) {
    return board.renderPluginElement(plugin, element, children as React.ReactElement[]);
  },
  (prev, next) =>
    prev.board === next.board &&
    prev.plugin === next.plugin &&
    prev.element === next.element &&
    sameRenderedChildren(prev.children, next.children)
);

/** 子元素集合比较：逐项按 ElementHost 的 element 引用判等（O(子数)，远低于重渲子树） */
function sameRenderedChildren(a: React.ReactNode, b: React.ReactNode): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    if (item === other) return true;
    if (!React.isValidElement(item) || !React.isValidElement(other)) return false;
    return (
      (item.props as { element?: BoardElement }).element ===
      (other.props as { element?: BoardElement }).element
    );
  });
}

export default Board;
