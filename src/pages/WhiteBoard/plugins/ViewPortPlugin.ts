import { IBoardPlugin, ViewPort, Board } from '../types';
import { BOARD_TO_CONTAINER } from "../constants";
import { ViewPortTransforms } from "../transforms";

export class ViewPortPlugin implements IBoardPlugin {
  name = 'viewport-plugin';

  isMouseDown = false;
  boardOriginViewPort: ViewPort | null = null;
  boardOriginOffset: { x: number; y: number } | null = null;
  lastWheelTime = 0;

  onPointerDown(e: PointerEvent, board: Board) {
    // 右键
    if (e.button === 2) {
      this.isMouseDown = true;
      this.boardOriginOffset = { x: e.clientX, y: e.clientY };
      this.boardOriginViewPort = board.viewPort;
    }
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.isMouseDown || !this.boardOriginOffset || !this.boardOriginViewPort) return;

    const { x, y } = { x: e.clientX, y: e.clientY }
    const { x: originX, y: originY } = this.boardOriginOffset;
    const { zoom, minX, minY } = this.boardOriginViewPort;
    const deltaX = originX - x;
    const deltaY = originY - y;
    ViewPortTransforms.moveViewPort(board, minX + deltaX / zoom, minY + deltaY / zoom);
  }

  onGlobalPointerUp() {
    this.isMouseDown = false;
    this.boardOriginOffset = null;
    this.boardOriginViewPort = null;
  }

  onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  onWheel(e: WheelEvent, board: Board) {
    const now = Date.now();
    if (now - this.lastWheelTime < 100) return;
    this.lastWheelTime = now;

    if (e.defaultPrevented) return;

    if (e.ctrlKey) {
      // 获取当前鼠标的位置
      const container = BOARD_TO_CONTAINER.get(board);
      if (!container) return;
      const { x, y } = { x: e.clientX, y: e.clientY };
      const containerRect = container.getBoundingClientRect();
      // 得到当前鼠标在board中的坐标
      const boardX = x - containerRect.left;
      const boardY = y - containerRect.top;
      // 判断滚轮方向以及是否在board中
      if (e.deltaY < 0 && boardX > 0 && boardY > 0 && boardX < containerRect.width && boardY < containerRect.height) {
        // 放大
        const newZoom = Math.min(board.viewPort.zoom * 1.1, 10);
        ViewPortTransforms.updateZoom(board, newZoom, [boardX, boardY]);
      } else if (e.deltaY > 0 && boardX > 0 && boardY > 0 && boardX < containerRect.width && boardY < containerRect.height) {
        // 缩小
        const newZoom = Math.max(board.viewPort.zoom / 1.1, 0.1);
        ViewPortTransforms.updateZoom(board, newZoom, [boardX, boardY]);
      }
      e.preventDefault();
    } else {
      const newX = board.viewPort.minX + 3 * e.deltaX;
      const newY = board.viewPort.minY + 3 * e.deltaY;
      
      ViewPortTransforms.moveViewPort(board, newX, newY);
    }
  }
}