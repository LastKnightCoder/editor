import Board from "@/pages/WhiteBoard/Board.ts";
import { Selection } from "@/pages/WhiteBoard/types";

export class SelectTransforms {
  static updateSelectArea(board: Board, selection: Partial<Selection>) {
    board.apply({
      type: 'set_selection',
      properties: board.selection,
      newProperties: selection
    })
  }
}