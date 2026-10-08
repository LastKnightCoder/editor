import type Board from "../Board";
import { BOARD_TO_CONTAINER } from "../constants/map";

const pointerOwners = new Map<number, { board: Board }>();
const boardPointers = new WeakMap<Board, number>();
const finishedPointerEvents = new WeakSet<Event>();

/** 画布容器内的宿主浮层（如文档阅读纸）：其中的按键、剪贴板与指针事件不归画布 */
export const CANVAS_OVERLAY_ATTR = "data-whiteboard-overlay";

export const isCanvasOverlayEvent = (event: { target: EventTarget | null }) =>
  event.target instanceof Element && event.target.closest(`[${CANVAS_OVERLAY_ATTR}]`) !== null;

export function ownsBoardEvent(board: Board, event: Event): boolean {
  const root = BOARD_TO_CONTAINER.get(board);
  if (!root || board.isDestroyed) return false;
  if (isCanvasOverlayEvent(event)) return false;
  const target = event.target instanceof Element ? event.target : null;
  const owner = target?.closest("[data-whiteboard-root]");
  if (owner) return owner === root;
  return root.contains(document.activeElement);
}

export function claimBoardPointer(board: Board, event: PointerEvent): boolean {
  const held = boardPointers.get(board);
  const owner = pointerOwners.get(event.pointerId);
  if ((held !== undefined && held !== event.pointerId) || (owner && owner.board !== board))
    return false;
  pointerOwners.set(event.pointerId, { board });
  boardPointers.set(board, event.pointerId);
  return true;
}

export function ownsBoardPointerEvent(board: Board, event: PointerEvent): boolean {
  const owner = pointerOwners.get(event.pointerId);
  if (owner) return owner.board === board;
  return !boardPointers.has(board) && ownsBoardEvent(board, event);
}

export const wasBoardPointerFinished = (event: Event) => finishedPointerEvents.has(event);

export function finishBoardPointer(event: Event): void {
  finishedPointerEvents.add(event);
}

export function releaseBoardPointer(board: Board, event: PointerEvent): void {
  const owner = pointerOwners.get(event.pointerId);
  if (owner?.board !== board) return;
  // 保留到当前事件分发结束，避免其他实例接收同一次释放。
  queueMicrotask(() => {
    if (pointerOwners.get(event.pointerId) === owner) {
      pointerOwners.delete(event.pointerId);
      if (boardPointers.get(board) === event.pointerId) boardPointers.delete(board);
    }
  });
}

export function releaseBoardPointers(board: Board): void {
  boardPointers.delete(board);
  for (const [id, owner] of pointerOwners) {
    if (owner.board === board) pointerOwners.delete(id);
  }
}
