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

  private boardOriginViewPort: ViewPort | null = null;
  private boardOriginOffset: { x: number; y: number } | null = null;
  private hasRightClickMoved = false;
  private lastMoveTime = 0;

  private constructor() {}

  /** pointerdown 仲裁（原 ViewPortPlugin.onPointerDown 的右键分支） */
  static tryStart(board: Board, e: PointerEvent): PanningState | null {
    if (board.presentationManager.isPresentationMode) return null;
    if (e.button !== 2) return null;

    const state = new PanningState();
    state.boardOriginOffset = { x: e.clientX, y: e.clientY };
    state.boardOriginViewPort = { ...board.viewPort };
    state.hasRightClickMoved = false;
    return state;
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.boardOriginOffset || !this.boardOriginViewPort) return;
    if (board.presentationManager.isPresentationMode) return;

    const now = Date.now();
    if (now - this.lastMoveTime < 30) return;

    const diffX = e.clientX - this.boardOriginOffset.x;
    const diffY = e.clientY - this.boardOriginOffset.y;
    if (!this.hasRightClickMoved && Math.hypot(diffX, diffY) > 3) {
      this.hasRightClickMoved = true;
    }
    if (!this.hasRightClickMoved) {
      return;
    }

    this.lastMoveTime = now;

    const { x, y } = { x: e.clientX, y: e.clientY };
    const { x: originX, y: originY } = this.boardOriginOffset;
    const { zoom, minX, minY } = this.boardOriginViewPort;
    const deltaX = originX - x;
    const deltaY = originY - y;
    ViewPortTransforms.moveViewPort(board, minX + deltaX / zoom, minY + deltaY / zoom);
  }

  /** document pointerup：结束平移；右键未移动且在画布内时触发右键菜单 */
  onGlobalPointerUp(e: PointerEvent, board: Board) {
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
