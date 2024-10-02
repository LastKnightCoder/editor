import { Descendant } from 'slate';
import { v4 as getUuid } from 'uuid';

import { Board, EHandlerPosition, Point } from '../types';
import { PathUtil, PointUtil, getResizedBBox } from '../utils';
import RichText from '../components/RichText';
import { CommonPlugin, CommonElement } from './CommonPlugin';
import { SelectTransforms } from '../transforms';

export interface RichTextElement extends CommonElement {
  type: 'richtext';
  content: Descendant[];
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

export class RichTextPlugin extends CommonPlugin {
  name = 'richtext';

  constructor() {
    super();
    this.onDblClick = this.onDblClick.bind(this);
    this.onEditorSizeChange = this.onEditorSizeChange.bind(this);
    this.onContentChange = this.onContentChange.bind(this);
    this.removeAutoFocus = this.removeAutoFocus.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  onDblClick(event: MouseEvent, board: Board) {
    const currentPoint = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const element: RichTextElement = {
      id: getUuid(),
      type: 'richtext',
      x,
      y,
      width: 32,
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

  onResize(board: Board, element: RichTextElement, position: EHandlerPosition, startPoint: Point, endPoint: Point) {
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
    });

    board.emit('element:resize', [newElement]);

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement]
    });
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

  private onEditorSizeChange = (board: Board, element: RichTextElement, width: number, height: number) => {
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

  private onContentChange = (board: Board, element: RichTextElement, value: Descendant[]) => {
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

  render(_board: Board, { element }: { element: RichTextElement }) {
    const { id } = element;
    return (
      <RichText
        key={id}
        element={element}
        onContentChange={this.onContentChange}
        onEditorSizeChange={this.onEditorSizeChange}
        removeAutoFocus={this.removeAutoFocus}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
