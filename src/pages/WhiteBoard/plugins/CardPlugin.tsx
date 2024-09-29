import { Board, IBoardPlugin, BoardElement, Selection, EHandlerPosition, Point } from "../types";
import { isRectIntersect, selectAreaToRect, getResizedBBox, PathUtil } from "../utils";
import Card from "../components/Card";

interface CardElement extends BoardElement {
  type: 'card';
  cardId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
  borderWidth?: number;
  borderColor?: string;
  paddingWidth?: number;
  paddingHeight: number;
  resized: boolean;
}

export class CardPlugin implements IBoardPlugin {
  name = 'card';

  resizeElement(_board: Board, element: CardElement, options: { position: EHandlerPosition, anchor: Point, focus: Point }) {
    const { position, anchor, focus } = options;
    const newBBox = getResizedBBox(element, position, anchor, focus);
    return {
      ...element,
      ...newBBox,
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: newBBox.height,
    }
  }

  isHit(_board: Board, element: CardElement, x: number, y: number): boolean {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  private onResize = (board: Board, element: CardElement, width: number, height: number) => {
    const { width: w, height: h } = element;
    if (w === width && h === height) return;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      width: parseFloat(width.toFixed(2)),
      height: parseFloat(height.toFixed(2)),
    }
    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement,
    });
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

  render(board: Board, { element }: { element: CardElement }) {
    const { x, y, cardId, width, height, id, resized, readonly, borderWidth, borderColor, paddingWidth, paddingHeight } = element;
    return (
      <Card
        key={id}
        elementId={id}
        x={x}
        y={y}
        width={width}
        height={height}
        cardId={cardId}
        maxWidth={width}
        maxHeight={height}
        resized={resized}
        onResize={this.onResize.bind(this, board, element)}
        readonly={readonly}
        borderWidth={borderWidth}
        borderColor={borderColor}
        paddingWidth={paddingWidth}
        paddingHeight={paddingHeight}
      />
    )
  }
}