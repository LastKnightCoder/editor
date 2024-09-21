import Board, { IBoardPlugin, BoardElement } from "../Board.ts";

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

  init(board: Board) {
    board.hooks.onClick.tap('onClick', (e: MouseEvent) => {
      e.preventDefault();
    });
  }

  render({ element }: { element: CircleElement }) {
    const { id, center, radius, fill, stroke, strokeWidth } = element;
    return <circle key={id} cx={center[0]} cy={center[1]} r={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
}

export default CirclePlugin;
