import { Board, BoardElement, EHandlerPosition, IBoardPlugin, Point } from "../types";
import { PointUtil, PathUtil } from "../utils";

export class ResizePlugin implements IBoardPlugin {
  name = 'resize';

  resizingElement: BoardElement | null = null;
  resizePosition: EHandlerPosition | null = null;
  startPoint: Point | null = null;

  onPointerDown(e: PointerEvent, board: Board) {
    // isHit element
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return;

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    const hitResizeHandle = PointUtil.getHitResizeHandle(board, startPoint);
    if (hitResizeHandle) {
      const { element, position } = hitResizeHandle;
      this.resizingElement = element;
      this.resizePosition = position;
      this.startPoint = startPoint;
    }
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.startPoint || !this.resizingElement || !this.resizePosition) return;
    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!currentPoint) return;
    const resizedElement = board.resizeElement(this.resizingElement, {
      position: this.resizePosition,
      anchor: this.startPoint,
      focus: currentPoint
    });
    if (!resizedElement) return;
    // 更新 selectedElements，更新 Element
    const path = PathUtil.getPathByElement(board, resizedElement);
    if (!path) return;
    board.apply({
      type: 'set_node',
      path,
      properties: this.resizingElement,
      newProperties: resizedElement
    });
    board.apply({
      type: 'set_selection',
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [resizedElement]
      }
    });
  }

  onPointerUp() {
    if (this.startPoint && this.resizingElement && this.resizePosition) {
      this.startPoint = null;
      this.resizingElement = null;
      this.resizePosition = null;
    }
  }
}

export default ResizePlugin;