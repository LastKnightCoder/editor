import {
  IBoardPlugin,
  ViewPort,
  Board,
  ECreateBoardElementType,
} from "../types";
import { BOARD_TO_CONTAINER, MIN_ZOOM, MAX_ZOOM } from "../constants";
import { ViewPortTransforms } from "../transforms";
import isHotkey from "is-hotkey";

export class ViewPortPlugin implements IBoardPlugin {
  name = "viewport-plugin";

  isMouseDown = false;
  boardOriginViewPort: ViewPort | null = null;
  boardOriginOffset: { x: number; y: number } | null = null;
  lastWheelTime = 0;
  lastMoveTime = 0;

  onPointerDown(e: PointerEvent, board: Board) {
    // 右键
    if (e.button === 2) {
      this.isMouseDown = true;
      this.boardOriginOffset = { x: e.clientX, y: e.clientY };
      this.boardOriginViewPort = board.viewPort;
    }
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (
      !this.isMouseDown ||
      !this.boardOriginOffset ||
      !this.boardOriginViewPort
    )
      return;

    const now = Date.now();
    if (now - this.lastMoveTime < 30) return;
    this.lastMoveTime = now;

    const { x, y } = { x: e.clientX, y: e.clientY };
    const { x: originX, y: originY } = this.boardOriginOffset;
    const { zoom, minX, minY } = this.boardOriginViewPort;
    const deltaX = originX - x;
    const deltaY = originY - y;
    ViewPortTransforms.moveViewPort(
      board,
      minX + deltaX / zoom,
      minY + deltaY / zoom,
    );
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
    if (board.currentCreateType !== ECreateBoardElementType.None) return;

    const now = Date.now();
    if (now - this.lastWheelTime < 100) return;
    this.lastWheelTime = now;

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
      if (
        e.deltaY < 0 &&
        boardX > 0 &&
        boardY > 0 &&
        boardX < containerRect.width &&
        boardY < containerRect.height
      ) {
        // 放大
        const newZoom = Math.min(board.viewPort.zoom * 1.1, MAX_ZOOM);
        ViewPortTransforms.updateZoom(board, newZoom, [boardX, boardY]);
      } else if (
        e.deltaY > 0 &&
        boardX > 0 &&
        boardY > 0 &&
        boardX < containerRect.width &&
        boardY < containerRect.height
      ) {
        // 缩小
        const newZoom = Math.max(board.viewPort.zoom / 1.1, MIN_ZOOM);
        ViewPortTransforms.updateZoom(board, newZoom, [boardX, boardY]);
      }
      e.preventDefault();
    } else {
      // 使用触摸板的 deltaX 和 deltaY 都比较小，鼠标一般都会在 40 以上
      const isTouch = Math.abs(e.deltaX) < 10 && Math.abs(e.deltaY) < 10;

      const newX = board.viewPort.minX + (isTouch ? 10 : 3) * e.deltaX;
      const newY = board.viewPort.minY + (isTouch ? 10 : 2) * e.deltaY;

      ViewPortTransforms.moveViewPort(board, newX, newY);
    }
  }

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (isHotkey("mod+=", e)) {
      const newZoom = Math.min(board.viewPort.zoom * 1.1, 10);
      ViewPortTransforms.updateZoom(board, newZoom);
    } else if (isHotkey("mod+-", e)) {
      const newZoom = Math.max(board.viewPort.zoom / 1.1, 0.1);
      ViewPortTransforms.updateZoom(board, newZoom);
    } else if (isHotkey("mod+o", e)) {
      // 添加mod+o快捷键支持，用于全览
      e.preventDefault();

      // 获取当前选中的元素并创建副本
      const selectedElements = [...board.selection.selectedElements];
      const FIT_VIEW_PADDING = 50; // 固定内边距值

      if (selectedElements.length > 0) {
        // 如果有选中的元素，则全览选中的元素
        ViewPortTransforms.fitAllElements(
          board,
          FIT_VIEW_PADDING,
          true,
          selectedElements,
        );

        // 在下一个事件循环中恢复选中状态，避免被全局事件处理器清除
        setTimeout(() => {
          if (selectedElements.length > 0) {
            board.apply(
              {
                type: "set_selection",
                properties: board.selection,
                newProperties: {
                  selectArea: null,
                  selectedElements: selectedElements,
                },
              },
              false,
            );
          }
        }, 0);
      } else {
        // 否则全览所有元素
        ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true);
      }
    }
  }
}
