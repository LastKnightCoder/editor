import React from "react";
import { SyncBailHook } from 'tapable';
import EventEmitter from 'eventemitter3';
import { createDraft, finishDraft } from 'immer';
import { Operation } from './types';
import BoardUtil from "@/pages/WhiteBoard/BoardUtil.ts";

export interface IBoardPlugin {
  name: string;
  init: (board: Board) => void;
  render?: (value: { element: BoardElement & any, children?: React.ReactElement[] }) => React.ReactElement;
  // destroy?: (board: Board) => void;
}

const isValid = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const EVENTS = [
  'onMouseDown',
  'onGlobalMouseDown',
  'onMouseMove',
  'onMouseUp',
  'onGlobalMouseUp',
  'onMouseLeave',
  'onMouseEnter',
  'onClick',
  'onDblClick',
  'onContextMenu',
  'onWheel',
  'onKeyDown',
  'onKeyUp',
  // 'onTouchStart',
  // 'onTouchMove',
  // 'onTouchEnd',
  // 'onTouchCancel',
  // 'onPointerDown',
  // 'onPointerMove',
  // 'onPointerUp',
  // 'onPointerCancel',
  // 'onPointerLeave',
  // 'onPointerEnter',
  // 'onPointerOver',
  // 'onPointerOut',
  // 'onPointerCapture'
] as const;

const boardFlag = Symbol('board');

export interface BoardElement {
  id: string;
  type: string;
  groupId?: string;
  children?: BoardElement[];
  [key: string]: any;
}

class Board {
  static boardFlag = boardFlag;

  public boardFlag: typeof boardFlag;
  public isDestroyed: boolean;
  public hooks: Record<(typeof EVENTS[number]), SyncBailHook<[any], any>>;
  public value: BoardElement[];
  public plugins: IBoardPlugin[];
  public eventEmitter: EventEmitter;

  constructor(value: BoardElement[]) {
    this.boardFlag = boardFlag;
    this.isDestroyed = false;
    this.value = value;
    this.plugins = [];
    this.eventEmitter = new EventEmitter();

    // @ts-ignore
    this.hooks = {};
    EVENTS.forEach(event => {
      this.hooks[event] = new SyncBailHook(['event']);
    });
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
  }

  initPlugins(plugins: IBoardPlugin[]) {
    if (this.isDestroyed) return;
    const notFoundPlugins = plugins.filter(plugin => !this.plugins.find(p => p.name === plugin.name));
    this.plugins.push(...notFoundPlugins);
    this.plugins.forEach(plugin => plugin.init(this));
  }

  addPlugin(plugin: IBoardPlugin) {
    if (this.isDestroyed) return;
    if (this.plugins.find(plugin => plugin.name === plugin.name)) {
      return;
    }
    this.plugins.push(plugin);
    plugin.init(this);
  }

  onMouseDown(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onMouseDown.call(event);
  }
  onGlobalMouseDown(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onGlobalMouseDown.call(event);
  }
  onMouseMove(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onMouseMove.call(event);
  }
  onMouseUp(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onMouseUp.call(event);
  }
  onGlobalMouseUp(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onGlobalMouseUp.call(event);
  }
  onMouseLeave(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onMouseLeave.call(event);
  }
  onMouseEnter(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onMouseEnter.call(event);
  }
  onClick(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onClick.call(event);
  }
  onDblClick(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onDblClick.call(event);
  }
  onContextMenu(event: MouseEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onContextMenu.call(event);
  }
  onWheel(event: WheelEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onWheel.call(event);
  }
  onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onKeyDown.call(event);
  }
  onKeyUp(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    this.hooks.onKeyUp.call(event);
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
