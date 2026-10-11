import { IBoardPlugin, Board } from "../types";
import { BOARD_TO_CONTAINER, MIN_ZOOM, MAX_ZOOM } from "../constants";
import { ViewPortTransforms } from "../transforms";

/**
 * 视口的滚轮缩放/平移与右键菜单默认行为：
 * 缩放/全览快捷键已迁入 tau.interaction 扩展（extensions/interactionCommands.ts），
 * 右键拖拽平移已迁入交互内核（interactions/states/PanningState），
 * 方向键平移已迁入 interactions/states/ViewportMoveState。
 */
export class ViewPortPlugin implements IBoardPlugin {
  name = "viewport-plugin";

  private lastWheelTime = 0;

  onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  onWheel(e: WheelEvent, board: Board) {
    if (board.isCreating() || board.presentationManager.isPresentationMode) return;

    const now = Date.now();
    if (now - this.lastWheelTime < 100) return;
    this.lastWheelTime = now;

    // 获取当前鼠标的位置
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;
    const { x, y } = { x: e.clientX, y: e.clientY };
    const containerRect = container.getBoundingClientRect();

    // 检查鼠标是否在白板区域内
    const isInBoard =
      x >= containerRect.left &&
      x <= containerRect.right &&
      y >= containerRect.top &&
      y <= containerRect.bottom;

    if (!isInBoard) return;

    // 阻止默认行为
    e.preventDefault();

    if (e.ctrlKey) {
      // 得到当前鼠标在board中的坐标
      const boardX = x - containerRect.left;
      const boardY = y - containerRect.top;
      // 判断滚轮方向
      if (e.deltaY < 0) {
        // 放大
        const newZoom = Math.min(board.viewPort.zoom * 1.1, MAX_ZOOM);
        ViewPortTransforms.updateZoom(board, newZoom, [boardX, boardY]);
      } else if (e.deltaY > 0) {
        // 缩小
        const newZoom = Math.max(board.viewPort.zoom / 1.1, MIN_ZOOM);
        ViewPortTransforms.updateZoom(board, newZoom, [boardX, boardY]);
      }
    } else {
      // 使用触摸板的 deltaX 和 deltaY 都比较小，鼠标一般都会在 40 以上
      const isTouch = Math.abs(e.deltaX) < 10 && Math.abs(e.deltaY) < 10;

      const newX = board.viewPort.minX + (isTouch ? 10 : 3) * e.deltaX;
      const newY = board.viewPort.minY + (isTouch ? 10 : 2) * e.deltaY;

      ViewPortTransforms.moveViewPort(board, newX, newY);
    }
  }
}
