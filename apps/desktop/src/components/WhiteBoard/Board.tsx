import React from "react";
import EventEmitter from "eventemitter3";
import curry from "lodash/curry";
import SnapManager from "./utils/snap/SnapManager";
import { PresentationManager } from "./utils/PresentationManager";
import ViewportUtil from "./utils/ViewportUtil";

import {
  Operation,
  Selection,
  Events,
  EventHandler,
  IBoardPlugin,
  BoardElement,
  ViewPort,
  ECreateBoardElementType,
  PresentationSequence,
  ElementBounds,
  BoardContextMenuPayload,
  ContextMenuContext,
  PluginContextMenuItem,
  CustomOffset,
} from "./types";
import { isValid, executeSequence, BoardUtil } from "./utils";

import BoardOperations from "./utils/BoardOperations";
import { CapabilityService } from "./services/CapabilityService";
import { InteractionManager } from "./interactions/InteractionManager";

const boardFlag = Symbol("board");

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

  private plugins: IBoardPlugin[] = [];
  private eventEmitter: EventEmitter;
  public snap: SnapManager;
  public capabilityService: CapabilityService;
  public interactions: InteractionManager;

  public presentationManager: PresentationManager;
  public boardFlag: typeof boardFlag;
  public isDestroyed: boolean;
  public children: BoardElement[];
  public viewPort: ViewPort;
  public selection: Selection;
  public undos: Array<Operation[]>;
  public redos: Array<Operation[]>;
  public isEditingElements: string[] = [];
  private lastUndoTimestamp = 0; // 记录上次创建新 undo entry 的时间戳
  private elementVersion = 0;
  private snapshot: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences: PresentationSequence[];
  };

  private _currentCreateType: ECreateBoardElementType = ECreateBoardElementType.None;

  // 要创建哪种几何图形，放在这里是不是不太合理？放在插件里更合理
  public createOptions: any = null;

  constructor(
    children: BoardElement[],
    viewPort: ViewPort,
    selection: Selection,
    plugins: IBoardPlugin[] = [],
    presentationSequences: PresentationSequence[] = [],
    readonly = false
  ) {
    this.boardFlag = boardFlag;
    this.isDestroyed = false;
    this.children = children;
    this.eventEmitter = new EventEmitter();
    this.viewPort = viewPort;
    this.selection = selection;
    this.undos = [];
    this.redos = [];
    this.snapshot = {
      children: this.children,
      viewPort: this.viewPort,
      selection: this.selection,
      presentationSequences: presentationSequences,
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

  get readonly(): boolean {
    return this._readonly;
  }

  set readonly(value: boolean) {
    this._readonly = value;
    this.emit("readonlyChange", value);
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.off(event, listener);
  }

  emit(event: string, ...args: any[]) {
    this.eventEmitter.emit(event, ...args);
  }

  once(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.once(event, listener);
  }

  destroy() {
    this.isDestroyed = true;
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
  }

  isHit(element: BoardElement, x: number, y: number): boolean {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (!plugin) return false;
    return !!plugin.isHit?.(this, element, x, y);
  }

  moveElement(element: BoardElement, offsetX: number, offsetY: number) {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (!plugin) return;
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

    for (const plugin of this.plugins) {
      if (plugin.getContextMenu) {
        const items = plugin.getContextMenu(fullContext);
        allItems.push(...items);
      }
    }

    // 按 priority 排序（数字越小越靠前）
    return allItems.sort((a, b) => a.priority - b.priority);
  }

  onWheel(event: WheelEvent) {
    const fns = this.plugins.map(bindHandler("onWheel")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onKeyDown(event: KeyboardEvent) {
    if (this.interactions.routeKeyDown(event)) return;
    const fns = this.plugins.map(bindHandler("onKeyDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onKeyUp(event: KeyboardEvent) {
    if (this.interactions.routeKeyUp(event)) return;
    const fns = this.plugins.map(bindHandler("onKeyUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerDown(event: PointerEvent) {
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
    const fns = this.plugins.map(bindHandler("onDrop")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onDragOver(event: DragEvent) {
    if (this.readonly) return;
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

  apply(ops: Operation | Operation[], updateHistory = true) {
    if (!Array.isArray(ops)) {
      ops = [ops];
    }

    if (this.isDestroyed) return;
    if (ops.length === 0) return;

    // 使用抽离的核心逻辑进行操作应用
    const result = BoardOperations.applyOperations(
      {
        children: this.children,
        viewPort: this.viewPort,
        selection: this.selection,
      },
      ops,
      {
        readonly: this.readonly,
      }
    );

    const { data, metadata, operations: executedOps } = result;

    // 如果没有变化，直接返回
    if (!metadata.hasChanges) {
      return;
    }

    const hasElementMutation = executedOps.some(op =>
      ["set_node", "insert_node", "remove_node", "move_node"].includes(op.type)
    );
    const hasViewPortMutation = executedOps.some(op => op.type === "set_viewport");
    const hasSelectionMutation = executedOps.some(op => op.type === "set_selection");
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

    // 更新历史记录
    if (updateHistory) {
      // 使用 applyOperations 返回的已执行操作，确保历史记录与实际同步
      const processedOps =
        executedOps.length > 0 ? executedOps : BoardOperations.preprocessOperations(ops);

      const currentTimestamp = Date.now();
      const timeDiff = currentTimestamp - this.lastUndoTimestamp;

      // 如果距离上次创建新 undo entry 小于 1 秒，且 undos 不为空，则合并到最后一个 undo entry
      if (timeDiff < 1000 && this.undos.length > 0) {
        // 将操作添加到最后一个 undo entry
        const lastUndoEntry = this.undos[this.undos.length - 1];
        lastUndoEntry.push(...processedOps);
      } else {
        // 创建新的 undo entry
        this.undos.push(processedOps);
        this.lastUndoTimestamp = currentTimestamp;
      }

      if (this.undos.length > 100) {
        this.undos.shift();
      }
      this.redos = [];
    }

    // 发出事件
    try {
      if (childrenChanged) {
        this.emit("onValueChange", this.children);
      }
      if (viewPortChanged) {
        this.emit("onViewPortChange", this.viewPort);
      }
      if (selectionChanged) {
        this.emit("onSelectionChange", this.selection);
      }

      if (metadata.changedElements.length > 0) {
        this.emit("element:change", metadata.changedElements);
      }
      if (metadata.insertedElements.length > 0) {
        this.emit("element:insert", metadata.insertedElements);
      }
      if (metadata.removedElements.length > 0) {
        this.emit("element:remove", metadata.removedElements);
      }

      if (changed) {
        this.snapshot = {
          children: this.children,
          selection: this.selection,
          viewPort: this.viewPort,
          presentationSequences: this.presentationManager.sequences,
        };
        this.emit("change");
      }
    } catch (e) {
      console.error("Board apply error:", e);
    }
  }

  isElementSelected(element: BoardElement, selectArea?: Selection["selectArea"]): boolean {
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    return plugin?.isElementSelected?.(this, element, selectArea) ?? false;
  }

  renderElement(element: BoardElement): React.ReactElement | null | undefined {
    const { children } = element;
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    if (!plugin) return null;

    // 折叠等渲染期过滤由元素的 render 能力决定
    const visibleChildren = children
      ? this.capabilityService.getVisibleChildren(element, children)
      : children;

    return plugin.render?.(this, {
      element,
      children: this.renderElements(visibleChildren).filter(isValid),
    });
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
    if (this.readonly) return;
    if (this.undos.length === 0) return;
    const undo = this.undos.pop();
    if (!undo) return;
    const inverseOps = undo.map(item => BoardUtil.inverseOperation(item)).reverse();

    inverseOps.forEach(op => BoardOperations.markAsNormalized(op));
    this.apply(inverseOps, false);
    this.redos.push(undo);
  }

  redo() {
    if (this.readonly) return;
    if (this.redos.length === 0) return;
    const redo = this.redos.pop();
    if (!redo) return;
    redo.forEach(op => BoardOperations.markAsNormalized(op));
    this.apply(redo, false);
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

  get currentCreateType(): ECreateBoardElementType {
    return this._currentCreateType;
  }

  set currentCreateType(value: ECreateBoardElementType) {
    this._currentCreateType = value;
    this.emit("onCurrentCreateTypeChange");
  }

  // 获取插件实例
  public getPlugin<T extends IBoardPlugin>(name: string): T | undefined {
    return this.plugins.find(p => p.name === name) as T | undefined;
  }

  public filterElementsInViewport(
    elements: BoardElement[],
    expandPixels = 100
  ): VisibleElementTree[] {
    const result: VisibleElementTree[] = [];

    for (const element of elements) {
      const isInViewport = ViewportUtil.isElementInViewport(element, this.viewPort, expandPixels);

      let visibleChildren: VisibleElementTree[] = [];

      if (element.children && element.children.length > 0) {
        visibleChildren = this.filterElementsInViewport(element.children, expandPixels);
      }

      if (isInViewport || visibleChildren.length > 0) {
        result.push({
          element,
          children: visibleChildren,
        });
      }
    }

    return result;
  }

  public renderVisibleElements(
    elements?: VisibleElementTree[]
  ): Array<React.ReactElement | null | undefined> {
    if (!elements) return [];

    return elements
      .map(({ element, children }) => {
        const plugin = this.plugins.find(plugin => plugin.name === element.type);
        if (!plugin) return null;

        // 折叠等渲染期过滤由元素的 render 能力决定
        const processedChildren =
          children && children.length > 0
            ? this.capabilityService
                .getVisibleChildren(
                  element,
                  children.map(({ element: childElement }) => childElement)
                )
                .map((childElement, index) => ({
                  element: childElement,
                  children: children[index].children,
                }))
            : children;

        const renderedChildren = this.renderVisibleElements(processedChildren).filter(isValid);

        return plugin.render?.(this, {
          element,
          children: renderedChildren,
        });
      })
      .filter(isValid);
  }
}

export default Board;
