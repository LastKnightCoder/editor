import Board, { BoardElement, IBoardPlugin } from "@/pages/WhiteBoard/Board.ts";
import BoardUtil from "@/pages/WhiteBoard/BoardUtil.ts";
import PointUtil from "@/pages/WhiteBoard/PointUtil.ts";

export class MovePlugin implements IBoardPlugin {
  name = 'move-plugin';

  hitElement: BoardElement | null = null;
  startPoint: { x: number; y: number } | null = null;

  onPointerDown(e: PointerEvent, board: Board) {
    const viewPortPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!viewPortPoint) return;
    const hitElements = BoardUtil.getHitElements(board, viewPortPoint.x, viewPortPoint.y);
    if (hitElements.length > 0) {
      this.hitElement = hitElements[hitElements.length - 1];
      this.startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    } else {
      this.hitElement = null;
    }
  }
  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.hitElement || !this.startPoint) return;
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) return;
    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;
    board.moveElement(this.hitElement, offsetX, offsetY);
  }
  onPointerUp(e: PointerEvent, board: Board) {
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint || !this.startPoint || !this.hitElement) return;
    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;
    board.moveElement(this.hitElement, offsetX, offsetY);
    this.hitElement = null;
    this.startPoint = null;
  }
}