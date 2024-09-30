import { Board, IBoardPlugin, BoardElement, Selection, EHandlerPosition, Point } from "../types";
import { isRectIntersect, selectAreaToRect, getResizedBBox, PathUtil } from "../utils";
import { SelectTransforms } from "../transforms";

export type CommonElement = BoardElement & {
  x: number;
  y: number;
  width: number;
  height: number;
}

export abstract class CommonPlugin implements IBoardPlugin {
  abstract name: string;

  originResizeElement: CommonElement | null = null;

  constructor() {
    this.onResizeStart = this.onResizeStart.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onResizeEnd = this.onResizeEnd.bind(this);
  }

  isHit(_board: Board, element: CommonElement & any, x: number, y: number) {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: CommonElement & any, dx: number, dy: number) {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy
    }
  }

  isElementSelected(board: Board, element: CommonElement & any, selectArea: Selection['selectArea'] = board.selection.selectArea) {
    if (!selectArea) return false;
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(element, selectRect);
  }

  protected onResizeStart(element: CommonElement & any) {
    this.originResizeElement = element;
  }

  protected onResize(board: Board, element: CommonElement & any, position: EHandlerPosition, startPoint: Point, endPoint: Point) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(this.originResizeElement, position, startPoint, endPoint);
    const newElement = {
      ...element,
      ...newBBox
    }
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement
    });

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement]
    });
  }

  protected onResizeEnd() {
    this.originResizeElement = null;
  }
}

export default CommonPlugin;
