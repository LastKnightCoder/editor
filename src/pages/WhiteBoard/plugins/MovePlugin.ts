import { Board, BoardElement, IBoardPlugin } from "../types";
import { BoardUtil, PointUtil, PathUtil } from "../utils";

export class MovePlugin implements IBoardPlugin {
  name = 'move-plugin';

  moveElements: BoardElement[] | null = null;
  startPoint: { x: number; y: number } | null = null;
  isHitSelected = false

  onPointerDown(e: PointerEvent, board: Board) {
    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    const selectedElements = board.selection.selectedElements;
    const hitElements = BoardUtil.getHitElements(board, startPoint.x, startPoint.y);
    const isHitSelected = hitElements.some(element => selectedElements.find(selectedElement => selectedElement.id === element.id));
    if (selectedElements.length > 0 && isHitSelected) {
      this.moveElements = selectedElements;
    } else if (hitElements.length > 0) {
      this.moveElements = [hitElements[hitElements.length - 1]];
    } else {
      this.moveElements = null;
    }

    this.isHitSelected = isHitSelected;

    if (this.moveElements) {
      this.startPoint = startPoint;
      board.apply({
        type: 'set_selection',
        properties: board.selection,
        newProperties: {
          selectedElements: []
        }
      });
      board.movingElements = this.moveElements;
    }
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.moveElements || !this.startPoint) return;
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) return;
    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;
    this.moveElements.forEach(element => {
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (!path) return;
        board.apply({
          type: 'set_node',
          path,
          properties: element,
          newProperties: movedElement
        })
      }
    })
  }

  onPointerUp(e: PointerEvent, board: Board) {
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint || !this.startPoint || !this.moveElements) return;
    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    const movedElements: BoardElement[] = [];
    this.moveElements.forEach(element => {
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (!path) return;
        board.apply({
          type: 'set_node',
          path,
          properties: element,
          newProperties: movedElement
        })
        movedElements.push(movedElement);
      }
    })
    if (this.isHitSelected) {
      board.apply({
        type: 'set_selection',
        properties: board.selection,
        newProperties: {
          selectedElements: movedElements
        }
      });
      this.isHitSelected = false;
    }

    this.moveElements = null;
    this.startPoint = null;
    board.movingElements = [];
  }
}