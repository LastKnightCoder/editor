import { Board, BoardElement, ECreateBoardElementType, IBoardPlugin, Operation } from "../types";
import { BoardUtil, PointUtil, PathUtil } from "../utils";

export class MovePlugin implements IBoardPlugin {
  name = 'move-plugin';

  moveElements: BoardElement[] | null = null;
  startPoint: { x: number; y: number } | null = null;
  isHitSelected = false;
  isMoved = false;

  onPointerDown(e: PointerEvent, board: Board) {
    if (board.currentCreateType !== ECreateBoardElementType.None) {
      return;
    }
    
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
      }, false);
      board.emit('element:move', this.moveElements);
    }
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.moveElements || !this.startPoint) return;
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) return;
    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    if (!this.isMoved) {
      const diffL = Math.hypot(offsetX, offsetY);
      if (diffL > 5) {
        this.isMoved = true;
      }
    }
    if (!this.isMoved) return;

    const movedElements: BoardElement[] = [];
    const operations: Operation[] = [];

    this.moveElements.forEach(element => {
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (!path) return;
        operations.push({
          type: 'set_node',
          path,
          properties: element,
          newProperties: movedElement
        })
        movedElements.push(movedElement);
      }
    })
    if (operations.length > 0) {
      board.apply(operations, false);
    }
    board.emit('element:move', movedElements);
  }

  onPointerUp(e: PointerEvent, board: Board) {
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint || !this.startPoint || !this.moveElements || !this.isMoved) {
      this.moveElements = null;
      this.startPoint = null;
      this.isMoved = false;
      return;
    };

    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    const movedElements: BoardElement[] = [];
    const operations: Operation[] = [];
    this.moveElements.forEach(element => {
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (!path) return;
        operations.push({
          type: 'set_node',
          path,
          properties: element,
          newProperties: movedElement
        })
        movedElements.push(movedElement);
      }
    })
    if (this.isHitSelected) {
      operations.push({
        type: 'set_selection',
        properties: board.selection,
        newProperties: {
          selectedElements: movedElements
        }
      });
      this.isHitSelected = false;
    }
    board.emit('element:move-end');

    this.moveElements = null;
    this.startPoint = null;
    this.isMoved = false;
    if (operations.length > 0) {
      board.apply(operations);
    }
  }
}