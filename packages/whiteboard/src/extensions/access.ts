import type Board from "../Board";
import type { WhiteboardAPI } from "./api";

const boards = new WeakMap<WhiteboardAPI, Board>();
export function registerBoardAccess(api: WhiteboardAPI, board: Board) {
  boards.set(api, board);
}
export function resolveBoardAccess(api: WhiteboardAPI): Board {
  const board = boards.get(api);
  if (!board) throw new Error("无效的白板会话");
  return board;
}

export function tryResolveBoardAccess(api: WhiteboardAPI): Board | undefined {
  return boards.get(api);
}
