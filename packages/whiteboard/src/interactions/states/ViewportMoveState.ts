import type Board from "../../Board";
import { ViewPortTransforms } from "../../transforms";
import { ContinuousArrowMoveState } from "./ContinuousArrowMoveState";

/**
 * 方向键连续平移视口（原 ViewPortPlugin 的方向键部分）。
 * 无选中元素时按方向键进入（与 KeyboardMoveState 的分界由
 * InteractionManager 在 keydown 裁决时单点决定）。
 */
export class ViewportMoveState extends ContinuousArrowMoveState {
  readonly name = "viewport-move";

  protected navigate(board: Board, offsetX: number, offsetY: number): boolean {
    ViewPortTransforms.moveViewPort(
      board,
      board.viewPort.minX + offsetX,
      board.viewPort.minY + offsetY
    );
    return true;
  }
}
