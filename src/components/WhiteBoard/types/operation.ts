import { Selection } from "./selection.ts";
import { BoardElement, BoardTheme } from "./board.ts";
import { ViewPort } from "./viewport.ts";
import { Path } from "./path.ts";

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
  properties: Partial<BoardElement>;
  newProperties: Partial<BoardElement>;
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
