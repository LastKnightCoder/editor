import { BoardElement } from "../Board.ts";

type Path = number[];

export type InsertNodeOperation = {
  type: 'insert_node';
  path: Path;
  node: BoardElement;
};

export type RemoveNodeOperation = {
  type: 'remove_node';
  path: Path;
  node: BoardElement;
};

export type MoveNodeOperation = {
  type: 'move_node';
  path: Path;
  newPath: Path;
};

export type SetNodeOperation = {
  type: 'set_node';
  path: Path;
  properties: Partial<BoardElement>;
  newProperties: Partial<BoardElement>;
};

export type Operation = InsertNodeOperation | RemoveNodeOperation | MoveNodeOperation | SetNodeOperation;