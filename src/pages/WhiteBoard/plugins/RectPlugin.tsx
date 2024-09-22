import Board, { IBoardPlugin, BoardElement } from "../Board.ts";
import PathUtil from "@/pages/WhiteBoard/PathUtil.ts";

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

  moveElement(board: Board, element: RectElement, dx: number, dy: number) {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: {
        ...element,
        x: element.x + dx,
        y: element.y + dy
      }
    });
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
