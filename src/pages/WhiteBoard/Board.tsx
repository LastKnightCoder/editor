import React from "react";
import EventEmitter from 'eventemitter3';
import { createDraft, finishDraft } from 'immer';
import { Operation, Selection } from './types';
import BoardUtil from "@/pages/WhiteBoard/BoardUtil.ts";
import curry from 'lodash/curry';

export interface IBoardPlugin {
  name: string;
  onMouseDown?: EventHandler;
  onGlobalMouseDown?: EventHandler;
  onMouseMove?: EventHandler;
  onMouseUp?: EventHandler;
  onGlobalMouseUp?: EventHandler;
  onMouseLeave?: EventHandler;
  onMouseEnter?: EventHandler;
  onClick?: EventHandler;
  onDblClick?: EventHandler;
  onContextMenu?: EventHandler;
  onWheel?: EventHandler;
  onKeyUp?: EventHandler;
  onKeyDown?: EventHandler;
  onPointerDown?: EventHandler;
  onPointerUp?: EventHandler;
  onPointerMove?: EventHandler;
  onGlobalPointerDown?: EventHandler;
  onGlobalPointerUp?: EventHandler;
  onGlobalPointerMove?: EventHandler;
  getBBox?: (board: Board, element: BoardElement & any) => { x: number; y: number; width: number; height: number };
  isElementSelected?: (board: Board, element: BoardElement & any, selectArea?: Selection['selectArea']) => boolean;
  resizeElement?: (board: Board, element: BoardElement & any, width: number, height: number) => void;
  moveElement?: (board: Board, element: BoardElement & any, offsetX: number, offsetY: number) => BoardElement;
  isHit? (board: Board, element: BoardElement & any, x: number, y: number): boolean;
  render?: (value: { element: BoardElement & any, children?: React.ReactElement[] }) => React.ReactElement;
}

export interface BoardTheme {
  theme: string;
}

const isValid = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

type EventHandler = (event: Event & any, board: Board) => void | boolean;
export type Events =
  | 'onMouseDown'
  | 'onMouseMove'
  | 'onMouseUp'
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'onContextMenu'
  | 'onClick'
  | 'onDblClick'
  | 'onGlobalMouseDown'
  | 'onGlobalMouseUp'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onWheel'
  | 'onPointerDown'
  | 'onPointerUp'
  | 'onPointerMove'
  | 'onGlobalPointerDown'
  | 'onGlobalPointerUp'
  | 'onGlobalPointerMove';

const executeSequence = (fns: EventHandler[], event: Event, board: Board) => {
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    const result = fn(event, board);
    if (result === false) return;
    if (event.defaultPrevented) return;
  }
}

const boardFlag = Symbol('board');

export interface BoardElement {
  id: string;
  type: string;
  groupId?: string;
  children?: BoardElement[];
  [key: string]: any;
}

export interface ViewPort {
  minX: number;
  minY: number;
  width: number;
  height: number;
  zoom: number;
  [key: string]: any;
}

const bindHandler = curry((eventName: Events, plugin: IBoardPlugin): EventHandler | undefined => {
  if (plugin[eventName]) {
    return plugin[eventName]!.bind(plugin);
  }
});

class Board {
  static boardFlag = boardFlag;

  public boardFlag: typeof boardFlag;
  public isDestroyed: boolean;
  public children: BoardElement[];
  private plugins: IBoardPlugin[];
  private eventEmitter: EventEmitter;
  public viewPort: ViewPort;
  public selection: Selection;
  constructor(children: BoardElement[]) {
    this.boardFlag = boardFlag;
    this.isDestroyed = false;
    this.children = children;
    this.plugins = [];
    this.eventEmitter = new EventEmitter();
    this.viewPort = {
      minX: 0,
      minY: 0,
      width: 0,
      height: 0,
      zoom: 1
    }
    this.selection = {
      selectArea: null,
      selectedElements: []
    }
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

  apply(op: Operation) {
    this.children = createDraft(this.children);

    if (op.type === 'set_node') {
      const { path, newProperties, properties } = op;
      try {
        const node = BoardUtil.getNodeByPath(this, path);
        for (const key in newProperties) {
          const value = newProperties[key];

          if (value == null) {
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
      } finally {
        this.children = finishDraft(this.children);
      }
      this.emit('onValueChange', this.children);
      return;
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
      this.viewPort = finishDraft(this.viewPort);
      this.emit('onViewPortChange', this.viewPort);
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
      this.selection = finishDraft(this.selection);
      this.emit('onSelectionChange', this.selection);
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
    return plugin.render?.({ element, children: this.renderElements(children).filter(isValid) })
  }

  renderElements(value?: BoardElement[]) {
    if (!value) return [];
    return value.map(element => this.renderElement(element));
  }

  renderSelectedRect(elements: BoardElement[]) {
    return elements.map(element => {
      const plugin = this.plugins.find(plugin => plugin.name === element.type);
      if (!plugin) return null;
      const bounds = plugin.getBBox?.(this, element);
      if (bounds) {
        return <rect {...bounds} fillOpacity={0.2} fill={'red'} />
      }
    })
  }
}

export default Board;
