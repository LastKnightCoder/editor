import { HAND_TOOL_ID } from "../../constants/tools";
import type Board from "../../Board";
import { ViewPort } from "../../types";
import { BOARD_TO_CONTAINER } from "../../constants";
import { ViewPortTransforms } from "../../transforms";
import { BoardUtil, PointUtil } from "../../utils";
import type { InteractionState } from "../InteractionState";

/**
 * 抓手左键或任意工具右键拖拽平移视口。
 * 移动超过 3px 视为平移（并在 document pointerup 结束）；
 * 右键未移动且在画布内松开时触发右键菜单。
 */
export class PanningState implements InteractionState {
  readonly name = "panning";
  isFinished = false;

  private moved = false;
  private capturedPointer?: number;

  private constructor(
    private origin: ViewPort,
    private originX: number,
    private originY: number,
    private button: number
  ) {}

  /** pointerdown 仲裁（原 ViewPortPlugin.onPointerDown 的右键分支） */
  static tryStart(board: Board, e: PointerEvent): PanningState | null {
    if (board.presentationManager.isPresentationMode) return null;
    if (e.button !== 2 && !(board.activeTool === HAND_TOOL_ID && e.button === 0)) return null;

    // 避免原生 mousedown 把焦点从画布转移到 SVG portal 宿主并画出聚焦轮廓。
    if (e.button === 2) e.preventDefault();

    return new PanningState(board.viewPort, e.clientX, e.clientY, e.button);
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;
    const dx = e.clientX - this.originX;
    const dy = e.clientY - this.originY;
    if (!this.moved && Math.hypot(dx, dy) <= 3) return;
    if (!this.moved) {
      this.moved = true;
      const container = BOARD_TO_CONTAINER.get(board);
      container?.setAttribute("data-panning", "");
      if (
        container &&
        e.isTrusted &&
        e.buttons === (this.button === 2 ? 2 : 1) &&
        container.setPointerCapture
      ) {
        container.setPointerCapture(e.pointerId);
        this.capturedPointer = e.pointerId;
      }
    }

    const minX = this.origin.minX - dx / this.origin.zoom;
    const minY = this.origin.minY - dy / this.origin.zoom;
    if (minX !== board.viewPort.minX || minY !== board.viewPort.minY) {
      ViewPortTransforms.moveViewPort(board, minX, minY);
    }
  }

  onExit(board: Board) {
    const container = BOARD_TO_CONTAINER.get(board);
    container?.removeAttribute("data-panning");
    if (this.capturedPointer !== undefined && container?.hasPointerCapture(this.capturedPointer))
      container.releasePointerCapture(this.capturedPointer);
  }

  /** document pointerup：结束平移；右键未移动且在画布内时触发右键菜单 */
  onGlobalPointerUp(e: PointerEvent, board: Board) {
    if (e.button === this.button) this.onPointerMove(e, board);
    const shouldEmitContextMenu =
      this.button === 2 &&
      e.button === 2 &&
      !this.moved &&
      !board.presentationManager.isPresentationMode;

    const container = BOARD_TO_CONTAINER.get(board);
    const isInsideBoard = container
      ? (() => {
          const rect = container.getBoundingClientRect();
          return (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          );
        })()
      : false;

    this.isFinished = true;

    if (shouldEmitContextMenu && isInsideBoard) {
      this.emitContextMenu(e, board);
    }
  }

  private emitContextMenu(event: PointerEvent, board: Board) {
    const viewPortPoint = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
    if (!viewPortPoint) return;

    const hitElements = BoardUtil.getHitElements(board, viewPortPoint.x, viewPortPoint.y);
    const hitElement = hitElements.length > 0 ? hitElements[hitElements.length - 1] : undefined;
    const selectedElements = [...board.selection.selectedElements];
    const isHitSelected = !!(
      hitElement && selectedElements.some(element => element.id === hitElement.id)
    );
    const targetElements = isHitSelected ? selectedElements : hitElement ? [hitElement] : [];

    board.emit("internal:context-menu", {
      clientX: event.clientX,
      clientY: event.clientY,
      viewPortPoint,
      selectedElements,
      hitElements,
      hitElement,
      targetElements,
      isHitSelected,
    });
  }
}
