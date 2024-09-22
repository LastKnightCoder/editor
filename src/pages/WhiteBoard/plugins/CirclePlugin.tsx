import Board, { IBoardPlugin, BoardElement } from "../Board.ts";
import PathUtil from "@/pages/WhiteBoard/PathUtil.ts";

interface CircleElement extends BoardElement {
  type: "circle",
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  center: [number, number];
  radius: number;
}

export class CirclePlugin implements IBoardPlugin {
  name = "circle";

  isHit(_board: Board, element: CircleElement, x: number, y: number): boolean {
    const { center, radius } = element;
    const [cx, cy] = center;
    console.log("isHit", x, y, cx, cy, radius, Math.pow(x - cx, 2) + Math.pow(y - cy, 2) <= Math.pow(radius, 2))
    return Math.pow(x - cx, 2) + Math.pow(y - cy, 2) <= Math.pow(radius, 2);
  }

  moveElement(board: Board, element: CircleElement, dx: number, dy: number) {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const { center } = element;
    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: {
        ...element,
        center: [center[0] + dx, center[1] + dy]
      }
    });
  }

  render({ element }: { element: CircleElement }) {
    const { id, center, radius, fill, stroke, strokeWidth } = element;
    return <circle key={id} cx={center[0]} cy={center[1]} r={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
}

export default CirclePlugin;
