import { Board, IBoardPlugin, BoardElement, Selection, EHandlerPosition, Point } from "../types";
import { isRectIntersect, PointUtil, selectAreaToRect } from "../utils";
import Card from "../components/Card";

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

  resizeElement(board: Board, element: CardElement, options: { position: EHandlerPosition, anchor: Point, focus: Point }) {
    const { position, anchor, focus } = options;
    return PointUtil.getResizedBBox(board, element, position, anchor, focus)!;
  }

  isHit(_board: Board, element: CardElement, x: number, y: number): boolean {
    const { x: left, y: top, width, height } = element;

    const isInCard = x >= left && x <= left + width && y >= top && y <= top + height;

    return isInCard && ((x >= left && x <= left + 20) || (y >= top && y <= top + 20) || (x >= left + width - 20 && x <= left + width) || (y >= top + height - 20 && y <= top + height))
  }

  moveElement(_board: Board, element: CardElement, dx: number, dy: number) {
    return {
    ...element,
      x: element.x + dx,
      y: element.y + dy
    }
  }

  isElementSelected(board: Board, element: CardElement, selectArea: Selection['selectArea'] = board.selection.selectArea) {
    if (!selectArea) return false;
    const eleRect = this.getBBox(board, element);
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(eleRect, selectRect);
  }

  getBBox(_board: Board, element: CardElement) {
    const { x, y, width, height } = element;
    return {
      x,
      y,
      width,
      height
    }
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