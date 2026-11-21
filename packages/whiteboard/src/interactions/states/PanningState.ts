import type Board from "../../Board";
import { ViewPort } from "../../types";
import { BOARD_TO_CONTAINER } from "../../constants";
import { ViewPortTransforms } from "../../transforms";
import { BoardUtil, PointUtil } from "../../utils";
import type { InteractionState } from "../InteractionState";

/**
 * 右键拖拽平移视口（原 ViewPortPlugin 的指针部分）。
 * 右键按下进入；移动超过 3px 视为平移（并在 document pointerup 结束）；
 * 未移动且在画布内松开时触发右键菜单。
 */
export class PanningState implements InteractionState {
  readonly name = "panning";
  isFinished = false;

  private hasRightClickMoved = false;
  private capturedPointer?: number;

  private constructor(
    private origin: ViewPort,
    private originX: number,
    private originY: number
  ) {}

  /** pointerdown 仲裁（原 ViewPortPlugin.onPointerDown 的右键分支） */
  static tryStart(board: Board, e: PointerEvent): PanningState | null {
    if (board.presentationManager.isPresentationMode) return null;
    if (e.button !== 2) return null;

    return new PanningState(board.viewPort, e.clientX, e.clientY);
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;
    const dx = e.clientX - this.originX;
    const dy = e.clientY - this.originY;
    if (!this.hasRightClickMoved && Math.hypot(dx, dy) <= 3) return;
    if (!this.hasRightClickMoved) {
      this.hasRightClickMoved = true;
      const container = BOARD_TO_CONTAINER.get(board);
      container?.setAttribute("data-panning", "");
      if (container && e.isTrusted && e.buttons === 2 && container.setPointerCapture) {
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
    if (e.button === 2) this.onPointerMove(e, board);
    const shouldEmitContextMenu =
      e.button === 2 && !this.hasRightClickMoved && !board.presentationManager.isPresentationMode;

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
