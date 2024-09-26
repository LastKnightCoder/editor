import { Board, BoardElement, EHandlerPosition, Point } from "../types";
import { BOARD_TO_CONTAINER } from "../constants";
import { isValid } from '../utils';

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

  static getResizePointFromRect(rect: { x: number, y: number, width: number, height: number}) {
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

  static getHitResizeHandle(board: Board, point: Point) {
    const selectedElements = board.selection.selectedElements;

    // 根据 selectedElements 获取 resize handle 的坐标
    const resizeHandles = selectedElements.map(element => {
      const bbox = board.getBBox(element);
      if (!bbox) return;
      return {
        element,
        bbox,
        handles: PointUtil.getResizePointFromRect(bbox)
      }
    }).filter(isValid);

    for (let i = 0; i < resizeHandles.length; i++) {
      const { element, handles } = resizeHandles[i];
      const hitHandle = Object.entries(handles).find(([, { x, y }]) => {
        return Math.sqrt(Math.hypot(point.x - x, point.y - y)) < 4;
      });
      if (hitHandle) {
        return {
          element,
          position: hitHandle[0] as EHandlerPosition,
        }
      }
    }
  }

  static getResizedBBox(board: Board, element: BoardElement, position: EHandlerPosition, anchor: Point, focus: Point) {
    const bbox = board.getBBox(element);
    if (!bbox) return;
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
      ...element,
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    }
  }

}

export default PointUtil;
