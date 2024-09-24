import Board, { IBoardPlugin, BoardElement } from "../Board";
import { Selection } from "@/pages/WhiteBoard/types";
import { isRectIntersect, selectAreaToRect } from "@/pages/WhiteBoard/utils.ts";

interface RectElement extends BoardElement {
  type: "rect",
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width: number;
  height: number;
  x: number;
  y: number;
}

export class RectPlugin implements IBoardPlugin {
  name = "rect";

  isHit(_board: Board, element: RectElement, x: number, y: number) {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: RectElement, dx: number, dy: number) {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy
    }
  }

  isElementSelected(board: Board, element: RectElement, selectArea: Selection['selectArea'] = board.selection.selectArea) {
    if (!selectArea) return false;
    const eleRect = this.getBBox(board, element);
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(eleRect, selectRect!);
  }

  getBBox(_board: Board, element: RectElement) {
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height
    }
  }

  render({ element }: { element: RectElement }) {
    const {
      id,
      width,
      height,
      x,
      y,
      fill = 'transparent',
      stroke = 'black',
      strokeWidth = 2
    } = element;

    return (
      <rect
        key={id}
        width={width}
        height={height}
        x={x}
        y={y}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    )
  }
}

export default RectPlugin;
