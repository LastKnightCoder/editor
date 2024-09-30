import { Descendant } from 'slate';
import { v4 as getUuid } from 'uuid';

import { Board, IBoardPlugin, BoardElement, EHandlerPosition, Point, SelectArea } from '../types';
import { PathUtil, getResizedBBox, selectAreaToRect, isRectIntersect, PointUtil } from '../utils';
import RichText from '../components/RichText';


interface RichTextElement extends BoardElement {
  type: 'richtext';
  content: Descendant[];
  x: number;
  y: number;
  width: number;
  height: number;
  readonly?: boolean;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  borderWidth?: number;
  borderColor?: string;
  paddingWidth?: number;
  paddingHeight?: number;
  autoFocus?: boolean;
}

export class RichTextPlugin implements IBoardPlugin {
  name = 'richtext';

  onDblClick(event: MouseEvent, board: Board) {
    const currentPoint = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const element: RichTextElement = {
      id: getUuid(),
      type: 'richtext',
      x,
      y,
      width: 42,
      height: 42,
      maxWidth: 300,
      maxHeight: 1000,
      readonly: false,
      resized: false,
      content: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }]
      }],
      borderWidth: 2,
      borderColor: '#ed556a',
      paddingWidth: 16,
      paddingHeight: 8,
      autoFocus: true,
    }

    board.apply({
      type: 'insert_node',
      path: [board.children.length],
      node: element,
    });
  }

  resizeElement(_board: Board, element: RichTextElement, options: { position: EHandlerPosition, anchor: Point, focus: Point }) {
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

  isHit(_board: Board, element: RichTextElement, x: number, y: number): boolean {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: RichTextElement, dx: number, dy: number) {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy
    }
  }

  isElementSelected(board: Board, element: RichTextElement, selectArea: SelectArea | null = board.selection.selectArea) {
    if (!selectArea) return false;
    const eleRect = this.getBBox(board, element);
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(eleRect, selectRect);
  }

  getBBox(_board: Board, element: RichTextElement) {
    const { x, y, width, height } = element;
    return {
      x,
      y,
      width,
      height
    }
  }

  private removeAutoFocus = (board: Board, element: RichTextElement) => { 
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const newElement = {
      ...element,
      autoFocus: false,
    }
    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement,
    });
  }

  private onResize = (board: Board, element: RichTextElement, width: number, height: number) => {
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

  private onChange = (board: Board, element: RichTextElement, value: Descendant[]) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const newElement = {
      ...element,
      content: value,
    }
    board.apply({
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement,
    });
  }

  render(board: Board, { element }: { element: RichTextElement }) {
    const { id, content, x, y, width, height, maxWidth, maxHeight, readonly, resized, borderWidth, borderColor, paddingWidth, paddingHeight, autoFocus } = element;
    return (
      <RichText
          key={id}
          elementId={id}
          x={x}
          y={y}
          width={width}
          height={height}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          content={content}
          onChange={this.onChange.bind(this, board, element)}
          onResize={this.onResize.bind(this, board, element)}
          readonly={readonly}
          resized={resized}
          borderWidth={borderWidth}
          borderColor={borderColor}
          paddingWidth={paddingWidth}
          paddingHeight={paddingHeight}
          autoFocus={autoFocus}
          removeAutoFocus={this.removeAutoFocus.bind(this, board, element)}
        />
    );
  }
}
