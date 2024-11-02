import React from "react";
import EventEmitter from 'eventemitter3';
import { createDraft, finishDraft, isDraft, current } from 'immer';
import curry from 'lodash/curry';

import {
  Operation,
  Selection,
  Events,
  EventHandler,
  IBoardPlugin,
  BoardElement,
  ViewPort,
  ECreateBoardElementType,
} from './types';
import { isValid, executeSequence, PathUtil, BoardUtil } from './utils';

const boardFlag = Symbol('board');

const bindHandler = curry((eventName: Events, plugin: IBoardPlugin): EventHandler | undefined => {
  if (plugin[eventName]) {
    return plugin[eventName]!.bind(plugin);
  }
});

class Board {
  static boardFlag = boardFlag;

  private plugins: IBoardPlugin[] = [];
  private eventEmitter: EventEmitter;

  public boardFlag: typeof boardFlag;
  public isDestroyed: boolean;
  public children: BoardElement[];
  public viewPort: ViewPort;
  public selection: Selection;
  public undos: Array<Operation[]>;
  public redos: Array<Operation[]>;
  public isEditing: boolean;
  // 是否在编辑属性，在编辑属性时删除时不能把组件删除掉了
  public isEditingProperties: boolean;
  private snapshot: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
  }

  private _currentCreateType: ECreateBoardElementType = ECreateBoardElementType.None;
  public createOptions: any = null;

  constructor(children: BoardElement[], viewPort: ViewPort, selection: Selection, plugins: IBoardPlugin[] = []) {
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
      selection: this.selection
    }
    
    this.initPlugins(plugins);
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.isEditing = false;
    this.isEditingProperties = false;
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

  onMouseDown(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onMouseDown')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onGlobalMouseDown(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onGlobalMouseDown')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onMouseMove(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onMouseMove')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onMouseUp(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onMouseUp')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onGlobalMouseUp(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onGlobalMouseUp')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onMouseLeave(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onMouseLeave')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onMouseEnter(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onMouseEnter')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onClick(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onClick')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onDblClick(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onDblClick')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onContextMenu(event: MouseEvent) {
    const fns = this.plugins.map(bindHandler('onContextMenu')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onWheel(event: WheelEvent) {
    const fns = this.plugins.map(bindHandler('onWheel')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onKeyDown(event: KeyboardEvent) {
    const fns = this.plugins.map(bindHandler('onKeyDown')).filter(isValid);
    executeSequence(fns, event, this);
  }
  onKeyUp(event: KeyboardEvent) {
    const fns = this.plugins.map(bindHandler('onKeyUp')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerDown(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler('onPointerDown')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerUp(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler('onPointerUp')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPointerMove(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler('onPointerMove')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerDown(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler('onGlobalPointerDown')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerUp(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler('onGlobalPointerUp')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onGlobalPointerMove(event: PointerEvent) {
    const fns = this.plugins.map(bindHandler('onGlobalPointerMove')).filter(isValid);
    executeSequence(fns, event, this);
  }

  onPaste(event: ClipboardEvent) {
    const fns = this.plugins.map(bindHandler('onPaste')).filter(isValid);
    executeSequence(fns, event, this);
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
        if (op.type === 'set_node') {
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
          changedElements.push(current(node));
        } else if (op.type === 'insert_node') {
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
            console.error('insert_node error: index out of range', { path, index, parent });
          }
        } else if (op.type === 'remove_node') {
          if (!isDraft(this.children)) {
            this.children = createDraft(this.children);
          }
          const { path } = op;
          const parent = PathUtil.getParentByPath(this, path);
          if (!parent) return;
    
          const index = path[path.length - 1];
          if (parent.children && parent.children.length > index) {
            removedElements.push(current(parent.children[index]));
            parent.children.splice(index, 1);
          } else {
            console.error('insert_node error: index out of range', { path, index, parent });
          }
        } else if (op.type === 'set_viewport') {
          this.viewPort = createDraft(this.viewPort);
          const {  newProperties } = op;
          for (const key in newProperties) {
            const value = newProperties[key];
    
            if (value == null) {
              delete this.viewPort[key];
            } else {
              this.viewPort[key] = value;
            }
          }
        } else if (op.type === 'set_selection') {
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
    } catch(e) {
      console.error('e', e);
    } finally {
      let changed = false;
      if (isDraft(this.children)) {
        changed = true;
        this.children = finishDraft(this.children);
        this.emit('onValueChange', this.children);
      }
      if (isDraft(this.viewPort)) {
        changed = true;
        this.viewPort = finishDraft(this.viewPort);
        this.emit('onViewPortChange', this.viewPort);
      }
      if (isDraft(this.selection)) {
        changed = true;
        this.selection = finishDraft(this.selection);
        this.emit('onSelectionChange', this.selection);
      }

      if (changedElements.length > 0) {
        this.emit('element:change', changedElements)
      }
      if (removedElements.length > 0) {
        this.emit('element:remove', removedElements);
      }

      if (changed) {
        this.snapshot = {
          children: this.children,
          selection: this.selection,
          viewPort: this.viewPort
        }
        this.emit('change');
      }
    }
  }

  isElementSelected(element: BoardElement, selectArea?: Selection['selectArea']): boolean {
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    return plugin?.isElementSelected?.(this, element, selectArea) ?? false;
  }

  renderElement(element: BoardElement): React.ReactElement | null | undefined {
    const { children } = element;
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    if (!plugin) return null;
    return plugin.render?.(this, { element, children: this.renderElements(children).filter(isValid) })
  }

  renderElements(value?: BoardElement[]) {
    if (!value) return [];
    return value.map(element => this.renderElement(element));
  }

  getArrowBindPoint(element: BoardElement, connectId: string) {
    const plugin = this.plugins.find(plugin => plugin.name === element.type);
    return plugin?.getArrowBindPoint?.(this, element, connectId) ?? null;
  }

  undo() {
    if (this.undos.length === 0) return;
    const undo = this.undos.pop()!;
    const inverseOps = undo.map(item => BoardUtil.inverseOperation(item)).reverse();
    this.apply(inverseOps, false);
    this.redos.push(undo);
  }

  redo() {
    if (this.redos.length === 0) return;
    const redo = this.redos.pop()!;
    this.apply(redo, false);
    this.undos.push(redo);
  }

  subscribe(callback: () => void) {
    this.on('change', callback);

    return () => {
      this.off('change', callback);
    }
  }

  getSnapshot() {
    return this.snapshot;
  }

  get currentCreateType(): ECreateBoardElementType {
    return this._currentCreateType;
  }

  set currentCreateType(value: ECreateBoardElementType) {
    this._currentCreateType = value;
    console.log('set currentCreateType', value);
    this.emit('onCurrentCreateTypeChange');
  }
}

export default Board;
