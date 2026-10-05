import { IBoardPlugin, Board, ECreateBoardElementType, ViewPort } from "../types";
import { BOARD_TO_CONTAINER, MIN_ZOOM, MAX_ZOOM, FIT_VIEW_PADDING } from "../constants";
import { ViewPortTransforms } from "../transforms";
import { isEditableTarget } from "@/page/dom";
import isHotkey from "is-hotkey";

const VIEW_ANIMATION_MS = 300;

const isSameViewport = (a: ViewPort, b: ViewPort) =>
  (["minX", "minY", "width", "height", "zoom"] as const).every(
    key => Math.abs(a[key] - b[key]) <= 1e-6 * Math.max(1, Math.abs(b[key]))
  );

/**
 * 视口的滚轮缩放/平移与缩放快捷键：
 * mod+= / mod+- 缩放、mod+o 全览（有选区时全览选区）、
 * Z 全览 ↔ 回到原视角、shift+1 适应全部、shift+2 适应选中、shift+0 实际大小。
 * 右键拖拽平移已迁入交互内核（interactions/states/PanningState），
 * 方向键平移已迁入 interactions/states/ViewportMoveState。
 */
export class ViewPortPlugin implements IBoardPlugin {
  name = "viewport-plugin";

  private lastWheelTime = 0;
  /** Z 全览前的视角与全览目标；视角离开全览目标（手动平移 / 缩放）后再按 Z 重新全览 */
  private quickFit: { from: ViewPort; to: ViewPort } | null = null;

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

  onKeyDown(e: KeyboardEvent, board: Board) {
    // 画板接管的快捷键需同时阻止默认行为（Electron/Chromium 的窗口缩放角色
    // 在 renderer 标记事件已处理后才触发）与冒泡（md 导入等功能监听在 window 层）
    if (isHotkey("mod+=", e)) {
      e.preventDefault();
      e.stopPropagation();
      const newZoom = Math.min(board.viewPort.zoom * 1.1, 10);
      ViewPortTransforms.updateZoom(board, newZoom);
    } else if (isHotkey("mod+-", e)) {
      e.preventDefault();
      e.stopPropagation();
      const newZoom = Math.max(board.viewPort.zoom / 1.1, 0.1);
      ViewPortTransforms.updateZoom(board, newZoom);
    } else if (isHotkey("mod+o", e)) {
      // 添加mod+o快捷键支持，用于全览
      e.preventDefault();
      e.stopPropagation();

      // 获取当前选中的元素并创建副本
      const selectedElements = [...board.selection.selectedElements];

      if (selectedElements.length > 0) {
        // 如果有选中的元素，则全览选中的元素
        ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true, selectedElements);

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
              false
            );
          }
        }, 0);
      } else {
        // 否则全览所有元素
        ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true);
      }
    } else if (this.canUseViewKeys(e, board)) {
      this.handleViewKeys(e, board);
    }
  }

  /** 单键 / shift+数字 在文字编辑、输入法组合与演示中让位 */
  private canUseViewKeys(e: KeyboardEvent, board: Board) {
    return (
      !e.isComposing &&
      board.isEditingElements.length === 0 &&
      !isEditableTarget(e.target) &&
      !board.presentationManager.isPresentationMode
    );
  }

  private handleViewKeys(e: KeyboardEvent, board: Board) {
    if (isHotkey("z", e)) {
      this.toggleQuickFit(board);
    } else if (isHotkey("shift+1", e)) {
      ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true);
    } else if (isHotkey("shift+2", e)) {
      const selected = board.selection.selectedElements;
      if (selected.length === 0) return;
      ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true, [...selected]);
    } else if (isHotkey("shift+0", e)) {
      ViewPortTransforms.updateZoom(board, 1);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  private toggleQuickFit(board: Board) {
    const current = { ...board.viewPort };
    if (this.quickFit && isSameViewport(current, this.quickFit.to)) {
      const { from } = this.quickFit;
      this.quickFit = null;
      ViewPortTransforms.animateToViewport(board, current, from, VIEW_ANIMATION_MS);
      return;
    }
    const to = ViewPortTransforms.getFitViewport(board, FIT_VIEW_PADDING);
    if (!to) return;
    this.quickFit = { from: current, to };
    ViewPortTransforms.animateToViewport(board, current, to, VIEW_ANIMATION_MS);
  }
}
