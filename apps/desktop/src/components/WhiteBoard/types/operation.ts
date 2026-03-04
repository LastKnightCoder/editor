import { Selection } from "./selection.ts";
import { BoardElement, BoardTheme } from "./board.ts";
import { ViewPort } from "./viewport.ts";
import { Path } from "./path.ts";

// set_node 只允许 patch 当前节点自身属性，禁止通过 children 修改结构。
// 结构变化必须使用 insert_node/remove_node/move_node。
export type SetNodePatch = Partial<Omit<BoardElement, "children">> & {
  children?: never;
};

export type InsertNodeOperation = {
  type: "insert_node";
  path: Path;
  node: BoardElement;
};

export type RemoveNodeOperation = {
  type: "remove_node";
  path: Path;
  node: BoardElement;
};

export type MoveNodeOperation = {
  type: "move_node";
  path: Path;
  newPath: Path;
};

export type SetNodeOperation = {
  type: "set_node";
  path: Path;
  properties: SetNodePatch;
  newProperties: SetNodePatch;
};

export type SetSelectionOperation = {
  type: "set_selection";
  properties: Partial<Selection>;
  newProperties: Partial<Selection>;
};

export type SetViewportOperation = {
  type: "set_viewport";
  properties: Partial<ViewPort>;
  newProperties: Partial<ViewPort>;
};

export type SetThemeOperation = {
  type: "set_theme";
  properties: Partial<BoardTheme>;
  newProperties: Partial<BoardTheme>;
};

export type SetMovingOperation = {
  type: "set_moving";
  properties: BoardElement[];
  newProperties: BoardElement[];
};

export type Operation =
  | InsertNodeOperation
  | RemoveNodeOperation
  | MoveNodeOperation
  | SetNodeOperation
  | SetViewportOperation
  | SetSelectionOperation
  | SetMovingOperation
  | SetThemeOperation;
