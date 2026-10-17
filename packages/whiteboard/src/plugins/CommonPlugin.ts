import type {
  Board,
  IBoardPlugin,
  BoardElement,
  Selection,
  EHandlerPosition,
  Point,
  CustomOffset,
} from "../types";
import { isRectIntersect, selectAreaToRect, getResizedBBox } from "../utils/common";
import { PathUtil } from "../utils/PathUtil";
import { BoardUtil } from "../utils/BoardUtil";
import { ARROW_CONNECT_ID } from "../constants/arrow";
import { SelectTransforms } from "../transforms/SelectTransforms";

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

  /**
   * 判断元素是否可以 resize
   * @param element 元素
   * @returns 是否可以 resize，默认 true
   */
  static isResizable(element: BoardElement): boolean {
    return element.resizable !== false;
  }

  /**
   * 判断元素是否高度自适应
   * @param element 元素
   * @returns 是否高度自适应，默认 false
   */
  static isAutoHeight(element: BoardElement): boolean {
    return element.autoHeight === true;
  }

  static getArrowConnectPoints(element: CommonElement) {
    const { x, y, width, height } = element;
    return [
      {
        connectId: ARROW_CONNECT_ID.TOP,
        point: {
          x: x + 0.5 * width,
          y,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.BOTTOM,
        point: {
          x: x + 0.5 * width,
          y: y + height,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.LEFT,
        point: {
          x,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.RIGHT,
        point: {
          x: x + width,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.CENTER,
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
        connectId: ARROW_CONNECT_ID.TOP,
        point: {
          x: x + 0.5 * width,
          y: y - extend,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.BOTTOM,
        point: {
          x: x + 0.5 * width,
          y: y + height + extend,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.LEFT,
        point: {
          x: x - extend,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.RIGHT,
        point: {
          x: x + width + extend,
          y: y + 0.5 * height,
        },
      },
      {
        connectId: ARROW_CONNECT_ID.CENTER,
        point: {
          x: x + 0.5 * width,
          y: y + 0.5 * height,
        },
      },
    ];
  }

  // 自定义连接点：按相对坐标 uv 重算绝对坐标，与 5 个固定点统一为 uv 模型，
  // 这样图形移动/缩放时连接点天然跟随（resize 时因 uv 不变而按比例缩放）。
  static getCustomBindPoint(element: CommonElement, customOffset: CustomOffset): Point {
    const { x, y, width, height } = element;
    return {
      x: x + customOffset.u * width,
      y: y + customOffset.v * height,
    };
  }

  getArrowBindPoint(
    _board: Board,
    element: CommonElement,
    connectId: string,
    customOffset?: CustomOffset
  ) {
    const { x, y, width, height } = element;

    if (connectId === ARROW_CONNECT_ID.CUSTOM) {
      if (!customOffset) return null;
      return CommonPlugin.getCustomBindPoint(element, customOffset);
    }

    if (connectId === ARROW_CONNECT_ID.LEFT) {
      return {
        x: x,
        y: y + 0.5 * height,
      };
    } else if (connectId === ARROW_CONNECT_ID.RIGHT) {
      return {
        x: x + width,
        y: y + 0.5 * height,
      };
    } else if (connectId === ARROW_CONNECT_ID.TOP) {
      return {
        x: x + 0.5 * width,
        y: y,
      };
    } else if (connectId === ARROW_CONNECT_ID.BOTTOM) {
      return {
        x: x + 0.5 * width,
        y: y + height,
      };
    } else if (connectId === ARROW_CONNECT_ID.CENTER) {
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

  moveElement(_board: Board, element: CommonElement & any, dx: number, dy: number) {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy,
    };
  }

  getBounds(_board: Board, element: CommonElement & any) {
    const { x = 0, y = 0, width = 0, height = 0 } = element;
    return {
      minX: x,
      minY: y,
      maxX: x + width,
      maxY: y + height,
    };
  }

  isElementSelected(
    board: Board,
    element: CommonElement & any,
    selectArea: Selection["selectArea"] = board.selection.selectArea
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
    isAdsorb = false
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(
      this.originResizeElement,
      position,
      startPoint,
      endPoint,
      isPreserveRatio
    );
    const newElement = {
      ...element,
      ...newBBox,
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    const updateElement = board.snap.resize({
      element: newElement,
      bounds: newBBox,
      position,
      enabled: isAdsorb,
      preserveRatio: isPreserveRatio,
    });

    // 注意：容器类元素（Frame/Column 等）常带有 children。
    // 这里仅通过 set_node patch 更新 bbox 字段，避免把 children 一起写入操作历史。
    const buildBBoxPatch = (value: any) => {
      const patch: Record<string, number> = {};
      if (typeof value?.x === "number") patch.x = value.x;
      if (typeof value?.y === "number") patch.y = value.y;
      if (typeof value?.width === "number") patch.width = value.width;
      if (typeof value?.height === "number") patch.height = value.height;
      return patch;
    };

    const oldBBoxPatch = buildBBoxPatch(element);
    const newBBoxPatch = buildBBoxPatch(updateElement);

    newElement.x = updateElement.x;
    newElement.y = updateElement.y;
    newElement.width = updateElement.width;
    newElement.height = updateElement.height;
    board.apply(
      {
        type: "set_node",
        path,
        properties: oldBBoxPatch,
        newProperties: newBBoxPatch,
      },
      false
    );

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });

    return newElement;
  }

  protected onResizeEnd(board: Board) {
    if (!this.originResizeElement) return;
    // 获取当前元素的 parent，如果 parent 是自适应容器（如 Frame），
    // 则按容器能力重算 bounds（Column 等有序容器由自身 relayout 管理）
    const parent = BoardUtil.getParent(board, this.originResizeElement);
    const capService = board.capabilityService;
    if (parent && capService.isContainer(parent)) {
      const newBounds = capService.calculateContainerBounds(parent);
      const parentPath = PathUtil.getPathByElement(board, parent);
      if (newBounds && parentPath) {
        board.apply([
          {
            type: "set_node",
            path: parentPath,
            properties: {
              x: parent.x,
              y: parent.y,
              width: parent.width,
              height: parent.height,
            },
            newProperties: {
              x: newBounds.x,
              y: newBounds.y,
              width: newBounds.width,
              height: newBounds.height,
            },
          },
        ]);
      }
    }
    this.originResizeElement = null;
    board.snap.end();
  }
}

export default CommonPlugin;
