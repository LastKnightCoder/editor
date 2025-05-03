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

  // 方向键移动视口相关属性
  arrowKeyMoveInterval: number | null = null;
  currentArrowKey: string | null = null;
  isPreciseMode = false;

  onPointerDown(e: PointerEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;
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
      !this.boardOriginViewPort ||
      board.presentationManager.isPresentationMode
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
    if (
      board.currentCreateType !== ECreateBoardElementType.None ||
      board.presentationManager.isPresentationMode
    )
      return;

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

  // 处理方向键移动视口
  handleViewPortArrowNavigation(board: Board, key: string) {
    if (board.presentationManager.isPresentationMode) return;

    const moveDistance = this.isPreciseMode ? 1 : 5;
    let offsetX = 0;
    let offsetY = 0;

    switch (key) {
      case "ArrowUp":
        offsetY = -moveDistance;
        break;
      case "ArrowDown":
        offsetY = moveDistance;
        break;
      case "ArrowLeft":
        offsetX = -moveDistance;
        break;
      case "ArrowRight":
        offsetX = moveDistance;
        break;
    }

    ViewPortTransforms.moveViewPort(
      board,
      board.viewPort.minX + offsetX,
      board.viewPort.minY + offsetY,
    );
  }

  // 开始持续移动视口
  startContinuousViewPortMove(board: Board, key: string) {
    if (board.presentationManager.isPresentationMode) return;

    // 停止之前的移动
    this.stopContinuousViewPortMove();

    this.currentArrowKey = key;
    // 立即执行一次移动
    this.handleViewPortArrowNavigation(board, key);

    // 设置定时器持续移动
    this.arrowKeyMoveInterval = window.setInterval(() => {
      if (this.currentArrowKey) {
        this.handleViewPortArrowNavigation(board, this.currentArrowKey);
      }
    }, 60);
  }

  // 停止持续移动
  stopContinuousViewPortMove() {
    if (this.arrowKeyMoveInterval !== null) {
      clearInterval(this.arrowKeyMoveInterval);
      this.arrowKeyMoveInterval = null;
      this.currentArrowKey = null;
    }
  }

  onKeyDown(e: KeyboardEvent, board: Board) {
    // 检测精确模式 (alt/option键)
    if (e.altKey && !this.isPreciseMode) {
      this.isPreciseMode = true;
    }

    // 处理方向键移动视口 - 仅当没有选中元素时
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
      board.selection.selectedElements.length === 0
    ) {
      // 阻止默认行为（避免页面滚动）
      e.preventDefault();

      // 如果是新的方向键或者没有正在进行的移动，开始新的持续移动
      if (
        this.currentArrowKey !== e.key ||
        this.arrowKeyMoveInterval === null
      ) {
        this.startContinuousViewPortMove(board, e.key);
      }
      return;
    }

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

  onKeyUp(e: KeyboardEvent) {
    // 检测精确模式结束
    if (!e.altKey && this.isPreciseMode) {
      this.isPreciseMode = false;
    }

    // 如果释放的是当前激活的方向键，停止持续移动
    if (this.currentArrowKey === e.key) {
      this.stopContinuousViewPortMove();
    }
  }
}
