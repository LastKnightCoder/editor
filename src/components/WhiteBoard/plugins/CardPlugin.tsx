import { Board, IBoardPlugin, EHandlerPosition, Point } from "../types";
import { getResizedBBox, PathUtil } from "../utils";
import Card from "../components/Card";
import { CommonPlugin, CommonElement } from './CommonPlugin';
import { SelectTransforms } from "../transforms";

export interface CardElement extends CommonElement {
  type: 'card';
  cardId: number;
  maxWidth: number;
  maxHeight: number;
  paddingWidth?: number;
  paddingHeight: number;
  resized: boolean;
  readonly?: boolean;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export class CardPlugin extends CommonPlugin implements IBoardPlugin {
  name = 'card';

  constructor() {
    super();
    this.onEditorSizeChange = this.onEditorSizeChange.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  onResize(board: Board, element: CardElement, position: EHandlerPosition, startPoint: Point, endPoint: Point) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(this.originResizeElement, position, startPoint, endPoint);
    const newElement = {
      ...element,
      ...newBBox,
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: newBBox.height,
    }
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement
    }, false);

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement]
    });
  }

  private onEditorSizeChange = (board: Board, element: CardElement, width: number, height: number) => {
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

  render(_board: Board, { element }: { element: CardElement }) {
    const { id } = element;
    return (
      <Card
        key={id}
        element={element}
        onEditorSizeChange={this.onEditorSizeChange}
        onResizeStart={this.onResizeStart}
        onResizeEnd={this.onResizeEnd}
        onResize={this.onResize}
      />
    )
  }
}