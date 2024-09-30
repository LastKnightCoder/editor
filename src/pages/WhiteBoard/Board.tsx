import React from "react";
import EventEmitter from 'eventemitter3';
import { createDraft, finishDraft } from 'immer';
import curry from 'lodash/curry';

import {
  Operation,
  Selection,
  Events,
  EventHandler,
  IBoardPlugin,
  BoardElement,
  ViewPort,
  EHandlerPosition,
  Point
} from './types';
import { isValid, executeSequence, PathUtil, PointUtil } from './utils';

const boardFlag = Symbol('board');

const bindHandler = curry((eventName: Events, plugin: IBoardPlugin): EventHandler | undefined => {
  if (plugin[eventName]) {
    return plugin[eventName].bind(plugin);
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
  public movingElements: BoardElement[] = [];

  constructor(children: BoardElement[], plugins: IBoardPlugin[] = []) {
    this.boardFlag = boardFlag;
    this.isDestroyed = false;
    this.children = children;
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
    this.movingElements = [];
    this.initPlugins(plugins);
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

  getBBox(element: BoardElement & any): { x: number; y: number; width: number; height: number } | undefined {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (!plugin) return;
    return plugin.getBBox?.(this, element);
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

  resizeElement(element: BoardElement, options: { position: EHandlerPosition, anchor: Point, focus: Point }) {
    const plugin = this.plugins.find(p => p.name === element.type);
    if (plugin && typeof plugin.resizeElement === 'function') {
      return plugin.resizeElement(this, element, options);
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
      } finally {
        this.children = finishDraft(this.children);
      }
      this.emit('onValueChange', this.children);
      return;
    } else if (op.type === 'insert_node') {
      const { path, node } = op;
      const parent = PathUtil.getParentByPath(this, path);
      if (!parent) return;

      const index = path[path.length - 1];
      if (parent.children && parent.children.length >= index) {
        parent.children.splice(index, 0, node);
        this.children = finishDraft(this.children);
        this.emit('onValueChange', this.children);
      } else {
        console.error('insert_node error: index out of range', { path, index, parent });
      }
    } else if (op.type === 'remove_node') {
      const { path } = op;
      const parent = PathUtil.getParentByPath(this, path);
      if (!parent) return;

      const index = path[path.length - 1];
      if (parent.children && parent.children.length > index) {
        parent.children.splice(index, 1);
        this.children = finishDraft(this.children);
        this.emit('onValueChange', this.children);
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
    return plugin.render?.(this, { element, children: this.renderElements(children).filter(isValid) })
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
        const resizePoints = PointUtil.getResizePointFromRect(bounds);
        return (
          <g key={element.id}>
            <rect {...bounds} fillOpacity={0} stroke={'#4578db'} strokeWidth={1} style={{ pointerEvents: 'none' }} />
            {
              Object.entries(resizePoints).map(([position, point]) => (
                <circle
                  style={{
                    cursor: PointUtil.getResizeCursor(position as EHandlerPosition)
                  }}
                  key={`${element.id}-${position}`}
                  cx={point.x}
                  cy={point.y}
                  r={4}
                  fill={'#84a1d9'}
                />
              ))
            }
          </g>
        )
      }
    })
  }
}

export default Board;
