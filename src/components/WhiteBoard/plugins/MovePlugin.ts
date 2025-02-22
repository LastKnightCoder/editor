import { Board, BoardElement, ECreateBoardElementType, IBoardPlugin, Operation } from "../types";
import { BoardUtil, PointUtil, PathUtil, isValid, Rect } from "../utils";

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
    }
  }

  getUpdatedInfo(e: PointerEvent, board: Board) {
    let movedElements: BoardElement[] = [];

    if (!this.moveElements || !this.startPoint) {
      board.refLine.setCurrent({
        rects: [],
        lines: [],
      });
      return {
        movedElements,
      };
    }

    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) {
      board.refLine.setCurrent({
        rects: [],
        lines: [],
      });
      return {
        movedElements,
      };
    }

    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    this.moveElements.forEach(element => {
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (!path) return;
        movedElements.push(movedElement);
      }
    });

    const currentMoved: Rect[] = movedElements.map(me => {
      if (me.type === 'arrow') return;
      return {
        key: me.id,
        x: me.x,
        y: me.y,
        width: me.width,
        height: me.height,
      }
    }).filter(isValid);
    board.refLine.setCurrentRects(currentMoved);

    const newCurrent = board.refLine.getUpdateCurrent(!e.altKey, 5 / board.viewPort.zoom);
    if (!e.altKey) {
      // 根据 newCurrent 更新 movedElements
      movedElements = movedElements.map(me => {
        if (me.type === 'arrow') return me;
        const rect = newCurrent.rects.find(rect => rect.key === me.id);
        if (!rect) return;
        return {
          ...me,
          x: rect.x,
          y: rect.y,
        }
      }).filter(isValid);
    }
    board.refLine.setCurrent(newCurrent);

    return {
      movedElements,
    };
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

    const operations: Operation[] = [];

    const {
      movedElements,
    } = this.getUpdatedInfo(e, board);

    movedElements.forEach(movedElement => {
      const element = this.moveElements!.find(element => element.id === movedElement.id);
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;
      operations.push({
        type: 'set_node',
        path,
        properties: element,
        newProperties: movedElement
      })
    });

    if (operations.length > 0) {
      board.apply(operations, false);
    }
    movedElements.forEach(me => {
      board.refLine.removeRefRect(me.id);
    });
    board.emit('element:move', movedElements);
  }

  onPointerUp(e: PointerEvent, board: Board) {
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint || !this.startPoint || !this.moveElements || !this.isMoved) {
      board.emit('element:move-end');
      this.moveElements = null;
      this.startPoint = null;
      this.isMoved = false;
      return;
    }

    const {
      movedElements,
    } = this.getUpdatedInfo(e, board);

    const operations: Operation[] = [];
    movedElements.forEach(movedElement => {
      const element = this.moveElements?.find(element => element.id === movedElement.id);
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;
      operations.push({
        type: 'set_node',
        path,
        properties: element,
        newProperties: movedElement
      })
    });

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

    board.refLine.setCurrent({
      rects: [],
      lines: [],
    });
    if (operations.length > 0) {
      board.apply(operations);
    }

    board.emit('element:move-end');
    this.moveElements = null;
    this.startPoint = null;
    this.isMoved = false;
  }
}
