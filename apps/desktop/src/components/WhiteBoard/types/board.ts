import React from "react";
import { Selection } from "./selection.ts";
import Board from "../Board.tsx";
import { Point } from "./point.ts";
import { CustomOffset } from "./arrow.ts";
import type { IElementCapabilities } from "./capabilities.ts";
import type { InteractionState } from "../interactions/InteractionState.ts";

export { default as Board } from "../Board.tsx";

export enum ECreateBoardElementType {
  None = "none",
  Geometry = "geometry",
  StraightArrow = "straightArrow",
  Handwrite = "handwrite",
  Text = "text",
  Image = "image",
  Card = "card",
  MindMap = "mindMap",
  Webview = "webview",
  Frame = "frame",
  WhiteBoard = "whiteboard",
  Column = "column",
}

export interface BoardElement {
  id: string;
  type: string;
  // 可选名称，用于 UI 展示；为空时由各元素类型生成默认中文名称
  name?: string;
  groupId?: string;
  children?: BoardElement[];
  // 通用行为控制属性
  resizable?: boolean; // 是否允许 resize，默认 true
  autoHeight?: boolean; // 是否高度自适应，默认 false
  [key: string]: any;
}

export interface ElementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BoardContextMenuPayload {
  clientX: number;
  clientY: number;
  viewPortPoint: Point;
  selectedElements: BoardElement[];
  hitElements: BoardElement[];
  targetElements: BoardElement[];
  hitElement?: BoardElement;
  isHitSelected: boolean;
}

// 右键菜单上下文（扩展 BoardContextMenuPayload，包含 board 实例）
export interface ContextMenuContext extends BoardContextMenuPayload {
  board: Board;
}

// 插件返回的右键菜单项
export interface PluginContextMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  priority: number; // 排序优先级，数字越小越靠前
  children?: PluginContextMenuItem[]; // 支持两级嵌套
  onSelect: (context: ContextMenuContext) => void;
}

export type EventHandler = (event: Event & any, board: Board) => void | boolean;
export type Events =
  | "onMouseDown"
  | "onMouseMove"
  | "onMouseUp"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onContextMenu"
  | "onClick"
  | "onDblClick"
  | "onGlobalMouseDown"
  | "onGlobalMouseUp"
  | "onKeyDown"
  | "onKeyUp"
  | "onWheel"
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerMove"
  | "onGlobalPointerDown"
  | "onGlobalPointerUp"
  | "onGlobalPointerMove"
  | "onGlobalPointerCancel"
  | "onPaste"
  | "onCopy"
  | "onCut"
  | "onDrop"
  | "onDragOver"
  | "onDragEnter"
  | "onDragLeave";

export interface IBoardPlugin {
  name: string;
  /**
   * 元素类型自定义指针手势声明：pointerdown 命中该类型元素时由交互内核
   * 在广播前调用，返回手势状态则由内核接管路由（取代通用选择/拖拽并消费
   * 本次 pointerdown）；null 表示不接管。
   */
  claimPointerGesture?(
    board: Board,
    event: PointerEvent,
    hitElement: BoardElement,
  ): InteractionState | null;
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
  onGlobalPointerCancel?: EventHandler;
  onPaste?: EventHandler;
  onCopy?: EventHandler;
  onCut?: EventHandler;
  onDrop?: EventHandler;
  onDragOver?: EventHandler;
  onDragEnter?: EventHandler;
  onDragLeave?: EventHandler;
  getArrowBindPoint?: (
    board: Board,
    element: BoardElement & any,
    connectId: string,
    customOffset?: CustomOffset,
  ) => Point | null;
  isElementSelected?: (
    board: Board,
    element: BoardElement & any,
    selectArea?: Selection["selectArea"],
  ) => boolean;
  moveElement?: (
    board: Board,
    element: BoardElement & any,
    offsetX: number,
    offsetY: number,
  ) => BoardElement | null;
  isHit?(
    board: Board,
    element: BoardElement & any,
    x: number,
    y: number,
  ): boolean;
  render?: (
    board: Board,
    value: { element: BoardElement & any; children?: React.ReactElement[] },
  ) => React.ReactElement;
  getBounds?: (
    board: Board,
    element: BoardElement & any,
  ) => ElementBounds | null;
  // 获取右键菜单项
  getContextMenu?: (context: ContextMenuContext) => PluginContextMenuItem[];
  // 声明插件能力
  getCapabilities?: () => IElementCapabilities;
}

export interface BoardTheme {
  theme: string;
}

// 右键菜单触发弹窗的事件 Payload
export interface ContextMenuModalPayload {
  type:
    | "card"
    | "image"
    | "video"
    | "audio"
    | "webview"
    | "whiteboard"
    | "export-image";
  action?: string; // image: local/resource/url/ai; video: local/resource/url/bilibili/youtube; audio: local/resource/url/tts; whiteboard: create/reference; export-image: board/selection
  selectedElementIds?: string[];
}
