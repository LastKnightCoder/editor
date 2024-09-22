import React from "react";
import EventEmitter from 'eventemitter3';
import { createDraft, finishDraft } from 'immer';
import { Operation } from './types';
import BoardUtil from "@/pages/WhiteBoard/BoardUtil.ts";
import curry from 'lodash/curry';

export interface IBoardPlugin {
  name: string;
  // init: (board: Board) => void;
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
  render?: (value: { element: BoardElement & any, children?: React.ReactElement[] }) => React.ReactElement;
  // destroy?: (board: Board) => void;
}

export interface BoardTheme {
  theme: string;
}

const isValid = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

type EventHandler = (event: Event & any, board: Board) => void | boolean;
type Events = 'onMouseDown' | 'onMouseMove' | 'onMouseUp' | 'onMouseEnter' | 'onMouseLeave' | 'onContextMenu' | 'onClick' | 'onDblClick' | 'onGlobalMouseDown' | 'onGlobalMouseUp' | 'onKeyDown' | 'onKeyUp' | 'onWheel';

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
  public value: BoardElement[];
  private plugins: IBoardPlugin[];
  private eventEmitter: EventEmitter;
  public viewPort: ViewPort;

  constructor(value: BoardElement[]) {
    this.boardFlag = boardFlag;
    this.isDestroyed = false;
    this.value = value;
    this.plugins = [];
    this.eventEmitter = new EventEmitter();
    this.viewPort = {
      minX: 0,
      minY: 0,
      width: 0,
      height: 0,
      zoom: 1
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

  apply(op: Operation) {
    this.value = createDraft(this.value);

    if (op.type === 'set_node') {
      const { path, newProperties, properties } = op;
      try {
        const node = BoardUtil.getNodeByPath(this, path);
        console.log('set_node', node);
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
        this.value = finishDraft(this.value);
      }
      this.emit('onChange', this.value);
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
    }
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
}

export default Board;
