import {
  Board,
  IBoardPlugin,
  BoardElement,
  Selection,
  EHandlerPosition,
  Point,
  FrameElement,
} from "../types";
import {
  isRectIntersect,
  selectAreaToRect,
  getResizedBBox,
  PathUtil,
  BoardUtil,
  FrameUtil,
} from "../utils";
import { SelectTransforms } from "../transforms";

export type CommonElement = BoardElement & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export abstract class CommonPlugin implements IBoardPlugin {
  abstract name: string;

  originResizeElement: CommonElement | null = null;

  constructor() {
    this.onResizeStart = this.onResizeStart.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onResizeEnd = this.onResizeEnd.bind(this);
  }

  static getArrowConnectPoints(element: CommonElement) {
    const { x, y, width, height } = element;
    return [
      {
        connectId: "top",
        point: {
          x: x + 0.5 * width,
          y,
        },
      },
      {
        connectId: "bottom",
        point: {
          x: x + 0.5 * width,
          y: y + height,
        },
      },
      {
        connectId: "left",
        point: {
          x,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: "right",
        point: {
          x: x + width,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: "center",
        point: {
          x: x + 0.5 * width,
          y: y + 0.5 * height,
        },
      },
    ];
  }

  /**
   * extend：向外扩展距离，长度为 CSS 像素
   */
  static getArrowConnectExtendPoints(element: CommonElement, extend = 20) {
    const { x, y, width, height } = element;
    return [
      {
        connectId: "top",
        point: {
          x: x + 0.5 * width,
          y: y - extend,
        },
      },
      {
        connectId: "bottom",
        point: {
          x: x + 0.5 * width,
          y: y + height + extend,
        },
      },
      {
        connectId: "left",
        point: {
          x: x - extend,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: "right",
        point: {
          x: x + width + extend,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: "center",
        point: {
          x: x + 0.5 * width,
          y: y + 0.5 * height,
        },
      },
    ];
  }

  getArrowBindPoint(_board: Board, element: CommonElement, connectId: string) {
    const { x, y, width, height } = element;

    if (connectId === "left") {
      return {
        x: x,
        y: y + 0.5 * height,
      };
    } else if (connectId === "right") {
      return {
        x: x + width,
        y: y + 0.5 * height,
      };
    } else if (connectId === "top") {
      return {
        x: x + 0.5 * width,
        y: y,
      };
    } else if (connectId === "bottom") {
      return {
        x: x + 0.5 * width,
        y: y + height,
      };
    } else if (connectId === "center") {
      return {
        x: x + 0.5 * width,
        y: y + 0.5 * height,
      };
    }

    return null;
  }

  isHit(_board: Board, element: CommonElement & any, x: number, y: number) {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(
    _board: Board,
    element: CommonElement & any,
    dx: number,
    dy: number,
  ) {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy,
    };
  }

  isElementSelected(
    board: Board,
    element: CommonElement & any,
    selectArea: Selection["selectArea"] = board.selection.selectArea,
  ) {
    if (!selectArea) return false;
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(element, selectRect);
  }

  protected onResizeStart(element: CommonElement & any) {
    this.originResizeElement = element;
  }

  protected onResize(
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio = false,
    isAdsorb = false,
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(
      this.originResizeElement,
      position,
      startPoint,
      endPoint,
      isPreserveRatio,
    );
    const newElement = {
      ...element,
      ...newBBox,
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    board.refLine.setCurrentRects([
      {
        key: newElement.id,
        ...newBBox,
      },
    ]);
    const updateElement = board.refLine.getUpdateCurrent(
      isAdsorb,
      5 / board.viewPort.zoom,
      true,
      position,
    );
    board.refLine.setCurrent(updateElement);
    newElement.x = updateElement.rects[0].x;
    newElement.y = updateElement.rects[0].y;
    newElement.width = updateElement.rects[0].width;
    newElement.height = updateElement.rects[0].height;
    board.apply(
      {
        type: "set_node",
        path,
        properties: element,
        newProperties: newElement,
      },
      false,
    );

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });

    return newElement;
  }

  protected onResizeEnd(board: Board) {
    if (!this.originResizeElement) return;
    // 获取当前元素的 parent，如果 parent 是 frame，则需要更新 frame 的 bounds
    const parent = BoardUtil.getParent(board, this.originResizeElement);
    if (parent && parent.type === "frame") {
      const frame = parent as FrameElement;
      const newBounds = FrameUtil.calculateFrameBounds(frame);
      const framePath = PathUtil.getPathByElement(board, frame);
      if (framePath) {
        board.apply([
          {
            type: "set_node",
            path: framePath,
            properties: frame,
            newProperties: {
              ...frame,
              ...newBounds,
            },
          },
        ]);
      }
      this.originResizeElement = null;
      board.refLine.setCurrent({
        rects: [],
        lines: [],
      });
    }
  }
}

export default CommonPlugin;
