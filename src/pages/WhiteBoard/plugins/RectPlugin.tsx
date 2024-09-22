import Board, { IBoardPlugin, BoardElement } from "../Board.ts";
import PathUtil from "@/pages/WhiteBoard/PathUtil.ts";
// import { BOARD_TO_CONTAINER } from "@/pages/WhiteBoard/constants/map.ts";

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

  // onClick(e: MouseEvent, board: Board) {
  //   const container = BOARD_TO_CONTAINER.get(board);
  //   if (!container) return;
  //
  //   const { x, y } = container.getBoundingClientRect();
  //
  //   const viewPort = board.viewPort;
  //   const { minX, minY, zoom } = viewPort;
  //
  //   board.apply({
  //     type: 'set_node',
  //     path: [0],
  //     properties: {
  //
  //     },
  //     newProperties: {
  //       x: (e.clientX - x) / zoom + minX,
  //       y: (e.clientY - y) / zoom + minY,
  //       width: 100 + Math.random() * 200,
  //       height: 100 + Math.random() * 200,
  //       fill: `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`,
  //       stroke: `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`,
  //       strokeWidth: Math.random() * 10
  //     }
  //   })
  // }

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
