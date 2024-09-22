import Board, { BoardElement, IBoardPlugin } from "@/pages/WhiteBoard/Board.ts";
import Card from "@/pages/WhiteBoard/components/Card";
import PathUtil from "@/pages/WhiteBoard/PathUtil.ts";

interface CardElement extends BoardElement {
  type: 'card';
  cardId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CardPlugin implements IBoardPlugin {
  name = 'card';

  isHit(_board: Board, element: CardElement, x: number, y: number): boolean {
    const { x: left, y: top, width, height } = element;

    const isInCard = x >= left && x <= left + width && y >= top && y <= top + height;

    return isInCard && ((x >= left && x <= left + 20) || (y >= top && y <= top + 20) || (x >= left + width - 20 && x <= left + width) || (y >= top + height - 20 && y <= top + height))
  }

  moveElement(board: Board, element: CardElement, dx: number, dy: number) {
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

  render({ element }: { element: CardElement }) {
    const { x, y, cardId, width, height } = element;
    return (
      <foreignObject x={x} y={y} width={width} height={height}>
        <Card cardId={cardId} />
      </foreignObject>
    )
  }
}