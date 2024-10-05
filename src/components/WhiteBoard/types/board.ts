import { Selection } from "./selection.ts";
import Board from '../Board.tsx';
import { Point } from "./point.ts";

export { default as Board } from '../Board.tsx';

export enum ECreateBoardElementType {
  None = 'none',
  Geometry = 'geometry',
  StraightArrow = 'straightArrow',
  Text = 'text',
  Image = 'image',
  Card = 'card',
}

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
  | 'onGlobalPointerMove'
  | 'onPaste';

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
  onPaste?: EventHandler;
  getArrowBindPoint?: (board: Board, element: BoardElement & any, connectId: string) => Point | null;
  isElementSelected?: (board: Board, element: BoardElement & any, selectArea?: Selection['selectArea']) => boolean;
  moveElement?: (board: Board, element: BoardElement & any, offsetX: number, offsetY: number) => BoardElement | null;
  isHit? (board: Board, element: BoardElement & any, x: number, y: number): boolean;
  render?: (board: Board, value: { element: BoardElement & any, children?: React.ReactElement[] }) => React.ReactElement;
}

export interface BoardTheme {
  theme: string;
}