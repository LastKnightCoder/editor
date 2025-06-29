import React from "react";
import EventEmitter from "eventemitter3";
import { createDraft, finishDraft, isDraft } from "immer";
import curry from "lodash/curry";
import RefLineUtil, { Rect } from "./utils/RefLineUtil";
import { PresentationManager } from "./utils/PresentationManager";

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
} from "./types";
import { isValid, executeSequence, BoardUtil } from "./utils";
import BoardOperations from "./utils/BoardOperations";

const boardFlag = Symbol("board");

const bindHandler = curry(
  (eventName: Events, plugin: IBoardPlugin): EventHandler | undefined => {
    if (plugin[eventName]) {
      return plugin[eventName]!.bind(plugin);
    }
  },
);

class Board {
  static boardFlag = boardFlag;

  private plugins: IBoardPlugin[] = [];
  private eventEmitter: EventEmitter;
  public refLine: RefLineUtil;

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
  private snapshot: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences: PresentationSequence[];
  };

  private _currentCreateType: ECreateBoardElementType =
    ECreateBoardElementType.None;

  // 要创建哪种几何图形，放在这里是不是不太合理？放在插件里更合理
  public createOptions: any = null;

  constructor(
    children: BoardElement[],
    viewPort: ViewPort,
    selection: Selection,
    plugins: IBoardPlugin[] = [],
    presentationSequences: PresentationSequence[] = [],
    readonly = false,
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

    // 初始化演示管理器和序列
    this.presentationManager = new PresentationManager(
      this,
      presentationSequences,
    );
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.refLine = new RefLineUtil({
      refRects: this.getRefRects(),
    });
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
    this.eventEmitter.removeAllListeners();
    this.plugins = [];
  }

  initPlugins(plugins: IBoardPlugin[]) {
    if (this.isDestroyed) return;
    // 将名称重复的去掉，使用最新的
    plugins.forEach((plugin) => {
      const index = this.plugins.findIndex((p) => p.name === plugin.name);
      if (index !== -1) {
        this.plugins[index] = plugin;
      }
    });
    const newPlugins = plugins.filter(
      (plugin) => !this.plugins.some((p) => p.name === plugin.name),
    );
    this.plugins.push(...newPlugins);
  }

  addPlugin(plugin: IBoardPlugin) {
    if (this.isDestroyed) return;
    // 如果已经存在，替换
    const index = this.plugins.findIndex((p) => p.name === plugin.name);
    if (index !== -1) {
      this.plugins[index] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  isHit(element: BoardElement, x: number, y: number): boolean {
    const plugin = this.plugins.find((p) => p.name === element.type);
    if (!plugin) return false;
    return !!plugin.isHit?.(this, element, x, y);
  }

  moveElement(element: BoardElement, offsetX: number, offsetY: number) {
    const plugin = this.plugins.find((p) => p.name === element.type);
    if (!plugin) return;
    return plugin.moveElement?.(this, element, offsetX, offsetY);
  }

  onMouseDown(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins.map(bindHandler("onMouseDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalMouseDown(event: MouseEvent) {
    if (this.readonly) return;
    const fns = this.plugins
      .map(bindHandler("onGlobalMouseDown"))
      .filter(isValid);
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
    const fns = this.plugins
      .map(bindHandler("onGlobalMouseUp"))
      .filter(isValid);
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

  onWheel(event: WheelEvent) {
    const fns = this.plugins.map(bindHandler("onWheel")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onKeyDown(event: KeyboardEvent) {
    const fns = this.plugins.map(bindHandler("onKeyDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onKeyUp(event: KeyboardEvent) {
    const fns = this.plugins.map(bindHandler("onKeyUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerDown(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler("onPointerDown")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerUp(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler("onPointerUp")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerMove(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler("onPointerMove")).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerDown(event: PointerEvent) {
    const fns = this.plugins
      .map(bindHandler("onGlobalPointerDown"))
      .filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerUp(event: PointerEvent) {
    const fns = this.plugins
      .map(bindHandler("onGlobalPointerUp"))
      .filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerMove(event: PointerEvent) {
    const fns = this.plugins
      .map(bindHandler("onGlobalPointerMove"))
      .filter(isValid);
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

  // 添加一个清除参考线的辅助方法
  clearRefLines() {
    this.refLine.setCurrent({
      rects: [],
      lines: [],
    });
  }

  apply(
    ops: Operation | Operation[],
    updateHistory = true,
    skipPathTransform = false,
  ) {
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
        skipPathTransform,
      },
    );

    const { data, metadata } = result;

    // 如果没有变化，直接返回
    if (!metadata.hasChanges) {
      return;
    }

    // 更新Board状态（使用immer）
    let changed = false;

    // 更新children
    if (JSON.stringify(this.children) !== JSON.stringify(data.children)) {
      if (!isDraft(this.children)) {
        this.children = createDraft(this.children);
      }
      // 替换整个children数组
      this.children.splice(0, this.children.length, ...data.children);
      changed = true;
    }

    // 更新viewPort
    if (
      data.viewPort &&
      JSON.stringify(this.viewPort) !== JSON.stringify(data.viewPort)
    ) {
      this.viewPort = createDraft(this.viewPort);
      Object.keys(this.viewPort).forEach((key) => delete this.viewPort[key]);
      Object.assign(this.viewPort, data.viewPort);
      changed = true;
      // 视口变化时清除参考线
      this.clearRefLines();
    }

    // 更新selection
    if (
      data.selection &&
      JSON.stringify(this.selection) !== JSON.stringify(data.selection)
    ) {
      this.selection = createDraft(this.selection);
      Object.keys(this.selection).forEach((key) => delete this.selection[key]);
      Object.assign(this.selection, data.selection);
      changed = true;
    }

    // 更新参考线
    metadata.changedElements.forEach((element) => {
      if (element.type !== "arrow") {
        this.refLine.addRefRect({
          key: element.id,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        });
      }
    });

    metadata.removedElements.forEach((element) => {
      if (element.type !== "arrow") {
        this.refLine.removeRefRect(element.id);
      }
    });

    // 更新历史记录
    if (updateHistory) {
      // 存储预处理后的操作用于历史记录
      // 这些是经过路径转换验证的、实际执行过的操作
      const processedOps = BoardOperations.preprocessOperations(ops);

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

    // 发出事件并完成draft
    try {
      if (isDraft(this.children)) {
        this.children = finishDraft(this.children);
        this.emit("onValueChange", this.children);
      }
      if (isDraft(this.viewPort)) {
        this.viewPort = finishDraft(this.viewPort);
        this.emit("onViewPortChange", this.viewPort);
      }
      if (isDraft(this.selection)) {
        this.selection = finishDraft(this.selection);
        this.emit("onSelectionChange", this.selection);
      }

      if (metadata.changedElements.length > 0) {
        this.emit("element:change", metadata.changedElements);
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

  isElementSelected(
    element: BoardElement,
    selectArea?: Selection["selectArea"],
  ): boolean {
    const plugin = this.plugins.find((plugin) => plugin.name === element.type);
    return plugin?.isElementSelected?.(this, element, selectArea) ?? false;
  }

  renderElement(element: BoardElement): React.ReactElement | null | undefined {
    const { children } = element;
    const plugin = this.plugins.find((plugin) => plugin.name === element.type);
    if (!plugin) return null;
    return plugin.render?.(this, {
      element,
      children: this.renderElements(children).filter(isValid),
    });
  }

  renderElements(value?: BoardElement[]) {
    if (!value) return [];
    return value.map((element) => this.renderElement(element));
  }

  getArrowBindPoint(element: BoardElement, connectId: string) {
    const plugin = this.plugins.find((plugin) => plugin.name === element.type);
    return plugin?.getArrowBindPoint?.(this, element, connectId) ?? null;
  }

  undo() {
    if (this.readonly) return;
    if (this.undos.length === 0) return;
    const undo = this.undos.pop();
    if (!undo) return;
    const inverseOps = undo
      .map((item) => BoardUtil.inverseOperation(item))
      .reverse();

    // 跳过路径转换：undo存储的是已经转换过的操作，反转后直接应用
    this.apply(inverseOps, false, true);
    this.redos.push(undo);
  }

  redo() {
    if (this.readonly) return;
    if (this.redos.length === 0) return;
    const redo = this.redos.pop();
    if (!redo) return;
    // 跳过路径转换：redo是已经转换过的操作，直接应用
    this.apply(redo, false, true);
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

  get currentCreateType(): ECreateBoardElementType {
    return this._currentCreateType;
  }

  set currentCreateType(value: ECreateBoardElementType) {
    this._currentCreateType = value;
    this.emit("onCurrentCreateTypeChange");
  }

  getRefRects() {
    const rects: Rect[] = [];
    BoardUtil.dfs(this, (element) => {
      if (
        BoardUtil.isBoard(element) ||
        this.selection.selectedElements.some((ele) => ele.id === element.id)
      )
        return;
      if (element.type === "arrow") return;
      rects.push({
        key: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      });
    });
    return rects;
  }

  // 获取插件实例
  public getPlugin<T extends IBoardPlugin>(name: string): T | undefined {
    return this.plugins.find((p) => p.name === name) as T | undefined;
  }
}

export default Board;
