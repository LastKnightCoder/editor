import Board, { IBoardPlugin, BoardElement } from "../Board.ts";

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

  init(board: Board) {
    board.hooks.onClick.tap('onClick', (e: MouseEvent) => {
      if (e.defaultPrevented) return;

      console.log('on Rect Click', e);
      board.apply({
        type: 'set_node',
        path: [0],
        properties: {

        },
        newProperties: {
          x: e.clientX,
          y: e.clientY,
          width: 100 + Math.random() * 200,
          height: 100 + Math.random() * 200,
          fill: `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`,
          stroke: `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`,
          strokeWidth: Math.random() * 10
        }
      })
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
