import { Board, EHandlerPosition, Point, BBox } from "../types";
import { BOARD_TO_CONTAINER } from "../constants";

export class PointUtil {
  static screenToViewPort(board: Board, x: number, y: number) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return null;
    const { viewPort } = board;
    const { x: containerX, y: containerY } = container.getBoundingClientRect();
    const offsetX = x - containerX;
    const offsetY = y - containerY;
    const { minX, minY, zoom } = viewPort;

    return {
      x: offsetX / zoom + minX,
      y: offsetY / zoom + minY
    }
  }

  static getResizePointFromRect(rect: BBox) {
    const { x, y } = rect;
    // 获取矩形的 8 个可 resize 的圆点，保证圆心在线上
    return {
      [EHandlerPosition.TopLeft]: { x, y },
      [EHandlerPosition.Top]: { x: x + rect.width / 2, y },
      [EHandlerPosition.TopRight]: { x: x + rect.width, y },
      [EHandlerPosition.Left]: { x, y: y + rect.height / 2 },
      [EHandlerPosition.Right]: { x: x + rect.width, y: y + rect.height / 2 },
      [EHandlerPosition.BottomLeft]: { x, y: y + rect.height },
      [EHandlerPosition.Bottom]: { x: x + rect.width / 2, y: y + rect.height },
      [EHandlerPosition.BottomRight]: { x: x + rect.width, y: y + rect.height }
    }
  }

  static getResizedBBox(bbox: BBox, position: EHandlerPosition, anchor: Point, focus: Point): BBox {
    const { x: left, y: top, width, height } = bbox;
    const moveX = focus.x - anchor.x;
    const moveY = focus.y - anchor.y;
    let newX = left;
    let newY = top;
    let newWidth = width;
    let newHeight = height;
    // 还需要考虑拖拽超出了另一边，比如拖拽左边，超出了右边，那么 x, y 和 width, height 的值需要调整
    if ([EHandlerPosition.Left, EHandlerPosition.BottomLeft, EHandlerPosition.TopLeft].includes(position)) {
      newX = left + moveX;
      newWidth = width - moveX;
      if (newWidth < 0) {
        newX = left + width;
        newWidth = moveX - width;
      }
    }
    if ([EHandlerPosition.Right, EHandlerPosition.BottomRight, EHandlerPosition.TopRight].includes(position)) {
      newWidth = width + moveX;
      if (newWidth < 0) {
        newWidth = Math.abs(width + moveX);
        newX = left + width + moveX;
      }
    }
    if ([EHandlerPosition.Top, EHandlerPosition.TopLeft, EHandlerPosition.TopRight].includes(position)) {
      newY = top + moveY;
      newHeight = height - moveY;
      if (newHeight < 0) {
        newY = top + height;
        newHeight = moveY - height;
      }
    }
    if ([EHandlerPosition.Bottom, EHandlerPosition.BottomLeft, EHandlerPosition.BottomRight].includes(position)) {
      newHeight = height + moveY;
      if (newHeight < 0) {
        newHeight = Math.abs(moveY + height);
        newY = top + height + moveY;
      }
    }

    return {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    }
  }

  static getResizeCursor(position: EHandlerPosition) {
    switch (position) {
      case EHandlerPosition.Left:
        return 'w-resize'
      case EHandlerPosition.Right:
        return 'e-resize'
      case EHandlerPosition.Top:
        return 'n-resize'
      case EHandlerPosition.Bottom:
        return 's-resize'
      case EHandlerPosition.TopLeft:
        return 'nw-resize'
      case EHandlerPosition.TopRight:
        return 'ne-resize'
      case EHandlerPosition.BottomLeft:
        return 'sw-resize'
      case EHandlerPosition.BottomRight:
        return 'se-resize'
      default:
        return 'move'
    }
  }

}

export default PointUtil;
