import { Board, BoardElement, ECreateBoardElementType, IBoardPlugin, Operation } from "../types";
import { BoardUtil, PointUtil, PathUtil, isValid } from "../utils";
import { Rect } from "refline.js";

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

  private getCurrentNode(board: Board) {
    if (!this.moveElements) return null;

    const movedElements = this.moveElements.filter(element => !!board.moveElement(element, 0, 0));
    const rects = movedElements.map(element => {
      if (element.type === 'arrow') return;

      return {
        ...element,
        key: element.id,
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height
      }
    }).filter(isValid);

    let minLeft: number | undefined;
    let maxRight: number | undefined;
    let minTop: number | undefined;
    let maxBottom: number | undefined;

    rects.forEach(rect => {
      if (minLeft === undefined) {
        minLeft = rect.left;
      } else {
        minLeft = Math.min(minLeft, rect.left);
      }

      if (maxRight === undefined) {
        maxRight = rect.left + rect.width;
      } else {
        maxRight = Math.max(maxRight, rect.left + rect.width);
      }

      if (minTop === undefined) {
        minTop = rect.top;
      } else {
        minTop = Math.min(minTop, rect.top);
      }

      if (maxBottom === undefined) {
        maxBottom = rect.top + rect.height;
      } else {
        maxBottom = Math.max(maxBottom, rect.top + rect.height);
      }
    });

    if (minLeft !== undefined && maxRight !== undefined && minTop !== undefined && maxBottom !== undefined) {
      const current: Rect = {
        key: 'current',
        left: minLeft,
        top: minTop,
        width: maxRight - minLeft,
        height: maxBottom - minTop,
      }
      return current;
    }

    return null;
  }

  getUpdatedInfo(e: PointerEvent, board: Board) {
    const movedElements: BoardElement[] = [];
    const delta = { left: 0, top: 0 };
    let currentNode: Rect | null = null;

    if (!this.moveElements || !this.startPoint) return {
      movedElements,
      currentNode,
      delta
    };
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) return {
      movedElements,
      currentNode,
      delta
    };

    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    currentNode = this.getCurrentNode(board);

    const updater = board.refLine.adsorbCreator({
      current: currentNode,
      pageX: this.startPoint.x,
      pageY: this.startPoint.y,
      distance: 50,
      scale: board.viewPort.zoom,
    });

    const { delta: { left, top } } = updater({
      pageX: endPoint.x,
      pageY: endPoint.y,
    });
    delta.left = left;
    delta.top = top;

    // 不开启吸附
    if (e.altKey) {
      delta.left = offsetX;
      delta.top = offsetY;
    }

    if (currentNode) {
      currentNode.left = currentNode.left + delta.left;
      currentNode.top = currentNode.top + delta.top;
    }

    if (!this.isMoved) {
      const diffL = Math.hypot(offsetX, offsetY);
      if (diffL > 5) {
        this.isMoved = true;
      }
    }
    if (!this.isMoved) return {
      movedElements,
      currentNode,
      delta
    };

    this.moveElements.forEach(element => {
      const movedElement = board.moveElement(element, delta.left, delta.top);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (!path) return;
        movedElements.push(movedElement);
      }
    });

    return {
      movedElements,
      currentNode,
      delta
    };
  }

  onPointerMove(e: PointerEvent, board: Board) {
    const operations: Operation[] = [];

    const {
      movedElements,
      currentNode,
    } = this.getUpdatedInfo(e, board);

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

    if (operations.length > 0) {
      board.apply(operations, false);
    }
    movedElements.forEach(me => {
      board.refLine.removeRect(me.id);
    });
    board.refLine.setCurrent(currentNode);
    board.emit('element:move', movedElements);
  }

  onPointerUp(e: PointerEvent, board: Board) {
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint || !this.startPoint || !this.moveElements || !this.isMoved) {
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
      movedElements.push(movedElement);
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

    if (operations.length > 0) {
      board.apply(operations);
    }
    board.refLine.setCurrent(null);

    this.moveElements = null;
    this.startPoint = null;
    this.isMoved = false;
  }
}