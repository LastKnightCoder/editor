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

  static getArrowConnectPoints(_board: Board, element: CommonElement) {
    const { x, y, width, height } = element;
    return [{
      connectId: 'top',
      point: {
        x: x + 0.5 * width,
        y
      }
    }, {
      connectId: 'bottom',
      point: {
        x: x + 0.5 * width,
        y: y + height
      }
    }, {
      connectId: 'left',
      point: {
        x,
        y: y + 0.5 * height
      }
    }, {
      connectId: 'right',
      point: {
        x: x + width,
        y: y + 0.5 * height
      }
    }]
  }

  /**
   * extend：向外扩展距离，长度为 CSS 像素
   */
  static getArrowConnectExtendPoints(board: Board, element: CommonElement, extend = 20) {
    const { x, y, width, height } = element;
    const { zoom } = board.viewPort;
    extend = extend / zoom;
    return [{
      connectId: 'top',
      point: {
        x: x + 0.5 * width,
        y: y - extend
      }
    }, {
      connectId: 'bottom',
      point: {
        x: x + 0.5 * width,
        y: y + height + extend
      }
    }, {
      connectId: 'left',
      point: {
        x: x - extend,
        y: y + 0.5 * height
      }
    }, {
      connectId: 'right',
      point: {
        x: x + width + extend,
        y: y + 0.5 * height
      }
    }]
  }

  getArrowBindPoint(_board: Board, element: CommonElement, connectId: string) {
    const { x, y, width, height } = element;

    if (connectId === 'left') {
      return {
        x: x,
        y: y + 0.5 * height
      }
    } else if (connectId === 'right') {
      return {
        x: x + width,
        y: y + 0.5 * height
      }
    } else if (connectId === 'top') {
      return {
        x: x + 0.5 * width,
        y: y
      }
    } else if (connectId === 'bottom') {
      return {
        x: x + 0.5 * width,
        y: y + height
      }
    }

    return null;
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

    board.emit('element:resize', [newElement]);

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
