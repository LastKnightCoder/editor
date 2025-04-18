import React from "react";
import EventEmitter from "eventemitter3";
import { createDraft, finishDraft, isDraft, current } from "immer";
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
import { isValid, executeSequence, PathUtil, BoardUtil } from "./utils";

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

  apply(ops: Operation | Operation[], updateHistory = true) {
    if (!Array.isArray(ops)) {
      ops = [ops];
    }

    if (this.isDestroyed) return;
    if (ops.length === 0) return;

    const changedElements = [];
    const removedElements = [];
    try {
      for (const op of ops) {
        if (op.type === "set_node") {
          if (this.readonly) return;
          if (!isDraft(this.children)) {
            this.children = createDraft(this.children);
          }
          const { path, newProperties, properties } = op;
          const node = PathUtil.getElementByPath(this, path);
          for (const key in newProperties) {
            const value = newProperties[key];

            if (value === null) {
              delete node[key];
            } else {
              node[key] = value;
            }
          }

          for (const key in properties) {
            if (!Object.prototype.hasOwnProperty.call(newProperties, key)) {
              delete node[key];
            }
          }
          const currentNode = current(node);
          changedElements.push(currentNode);
          if (currentNode.type !== "arrow") {
            this.refLine.addRefRect({
              key: currentNode.id,
              x: currentNode.x,
              y: currentNode.y,
              width: currentNode.width,
              height: currentNode.height,
            });
          }
        } else if (op.type === "insert_node") {
          if (this.readonly) return;
          if (!isDraft(this.children)) {
            this.children = createDraft(this.children);
          }
          const { path, node } = op;
          const parent = PathUtil.getParentByPath(this, path);
          if (!parent) return;

          const index = path[path.length - 1];
          if (parent.children && parent.children.length >= index) {
            parent.children.splice(index, 0, node);
          } else {
            console.error("insert_node error: index out of range", {
              path,
              index,
              parent,
            });
          }
          if (node.type !== "arrow") {
            this.refLine.addRefRect({
              key: node.id,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
            });
          }
        } else if (op.type === "remove_node") {
          if (this.readonly) return;
          if (!isDraft(this.children)) {
            this.children = createDraft(this.children);
          }
          const { path, node } = op;
          const parent = PathUtil.getParentByPath(this, path);
          if (!parent) return;

          const index = path[path.length - 1];
          if (parent.children && parent.children.length > index) {
            removedElements.push(current(parent.children[index]));
            parent.children.splice(index, 1);
          } else {
            console.error("insert_node error: index out of range", {
              path,
              index,
              parent,
            });
          }
          if (node.type !== "arrow") {
            this.refLine.removeRefRect(node.id);
          }
        } else if (op.type === "set_viewport") {
          this.viewPort = createDraft(this.viewPort);
          const { newProperties } = op;
          for (const key in newProperties) {
            const value = newProperties[key];

            if (value == null) {
              delete this.viewPort[key];
            } else {
              this.viewPort[key] = value;
            }
          }
          // 视口变化时清除参考线
          this.clearRefLines();
        } else if (op.type === "set_selection") {
          if (this.readonly) return;
          this.selection = createDraft(this.selection);
          const { newProperties } = op;
          for (const key in newProperties) {
            const value = newProperties[key];

            if (value == null) {
              delete this.selection[key];
            } else {
              this.selection[key] = value;
            }
          }
        }
      }

      if (updateHistory) {
        this.undos.push(ops);
        if (this.undos.length > 100) {
          this.undos.shift();
        }
        this.redos = [];
      }
    } catch (e) {
      console.error("e", e);
    } finally {
      let changed = false;
      if (isDraft(this.children)) {
        changed = true;
        this.children = finishDraft(this.children);
        this.emit("onValueChange", this.children);
      }
      if (isDraft(this.viewPort)) {
        changed = true;
        this.viewPort = finishDraft(this.viewPort);
        this.emit("onViewPortChange", this.viewPort);
      }
      if (isDraft(this.selection)) {
        changed = true;
        this.selection = finishDraft(this.selection);
        this.emit("onSelectionChange", this.selection);
      }

      if (changedElements.length > 0) {
        this.emit("element:change", changedElements);
      }
      if (removedElements.length > 0) {
        this.emit("element:remove", removedElements);
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
    this.apply(inverseOps, false);
    this.redos.push(undo);
  }

  redo() {
    if (this.readonly) return;
    if (this.redos.length === 0) return;
    const redo = this.redos.pop();
    if (!redo) return;
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
