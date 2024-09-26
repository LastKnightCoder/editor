import React from "react";
import { Point } from './point.ts';
import { EHandlerPosition } from './resize.ts';
import { Selection } from "./selection.ts";
import Board from '../Board.tsx';

export { default as Board } from '../Board.tsx';

export interface BoardElement {
  id: string;
  type: string;
  groupId?: string;
  children?: BoardElement[];
  [key: string]: any;
}

export type EventHandler = (event: Event & any, board: Board) => void | boolean;
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
  resizeElement?: (board: Board, element: BoardElement & any, options: { position: EHandlerPosition, anchor: Point, focus: Point }) => BoardElement;
  moveElement?: (board: Board, element: BoardElement & any, offsetX: number, offsetY: number) => BoardElement;
  isHit? (board: Board, element: BoardElement & any, x: number, y: number): boolean;
  render?: (value: { element: BoardElement & any, children?: React.ReactElement[] }) => React.ReactElement;
}

export interface BoardTheme {
  theme: string;
}