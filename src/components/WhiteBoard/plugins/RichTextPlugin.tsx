import { Descendant } from "slate";
import { v4 as getUuid } from "uuid";

import {
  Board,
  ECreateBoardElementType,
  EHandlerPosition,
  Point,
} from "../types";
import { PathUtil, PointUtil, RichTextUtil, getResizedBBox } from "../utils";
import RichText from "../components/RichText";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

export interface RichTextElement extends CommonElement {
  type: "richtext";
  content: Descendant[];
  readonly?: boolean;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  paddingWidth?: number;
  paddingHeight?: number;
  autoFocus?: boolean;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  background?: string;
  topColor?: string;
  color?: string;
  theme?: "light" | "dark";
}

export class RichTextPlugin extends CommonPlugin {
  name = "richtext";

  constructor() {
    super();
    this.onDblClick = this.onDblClick.bind(this);
    this.onEditorSizeChange = this.onEditorSizeChange.bind(this);
    this.onContentChange = this.onContentChange.bind(this);
    this.removeAutoFocus = this.removeAutoFocus.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  onDblClick(event: MouseEvent, board: Board) {
    const currentPoint = PointUtil.screenToViewPort(
      board,
      event.clientX,
      event.clientY,
    );
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const element: RichTextElement = {
      id: getUuid(),
      type: "richtext",
      x,
      y,
      width: 32,
      height: 42,
      maxWidth: 300,
      maxHeight: 1000,
      readonly: false,
      resized: false,
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
      paddingWidth: 16,
      paddingHeight: 16,
      autoFocus: true,
      ...RichTextUtil.getPrevRichtextStyle(),
    };

    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: element,
    });
  }

  onClick(e: MouseEvent, board: Board) {
    if (board.currentCreateType !== ECreateBoardElementType.Text) {
      return;
    }

    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const element: RichTextElement = {
      id: getUuid(),
      type: "richtext",
      x,
      y,
      width: 32,
      height: 42,
      maxWidth: 300,
      maxHeight: 1000,
      readonly: false,
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
      paddingWidth: 16,
      paddingHeight: 8,
      autoFocus: true,
      resized: false,
      ...RichTextUtil.getPrevRichtextStyle(),
    };
    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: element,
    });

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [],
    });

    board.currentCreateType = ECreateBoardElementType.None;
  }

  onResize(
    board: Board,
    element: RichTextElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    _isPreserveRatio = false,
    isAdsorb = false,
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(
      this.originResizeElement,
      position,
      startPoint,
      endPoint,
    );
    const newElement = {
      ...element,
      ...newBBox,
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: newBBox.height,
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    board.refLine.setCurrentRects([
      {
        key: newElement.id,
        ...newBBox,
      },
    ]);
    const updateElement = board.refLine.getUpdateCurrent(
      isAdsorb,
      5 / board.viewPort.zoom,
      true,
      position,
    );
    board.refLine.setCurrent(updateElement);
    newElement.x = updateElement.rects[0].x;
    newElement.y = updateElement.rects[0].y;
    newElement.width = updateElement.rects[0].width;
    newElement.height = updateElement.rects[0].height;
    board.apply(
      {
        type: "set_node",
        path,
        properties: element,
        newProperties: newElement,
      },
      false,
    );

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });
  }

  private removeAutoFocus = (board: Board, element: RichTextElement) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const newElement = {
      ...element,
      autoFocus: false,
    };
    board.apply({
      type: "set_node",
      path,
      properties: element,
      newProperties: newElement,
    });
  };

  private onEditorSizeChange = (
    board: Board,
    element: RichTextElement,
    width: number,
    height: number,
  ) => {
    const { width: w, height: h } = element;
    if (w === width && h === height) return;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      width: parseFloat(width.toFixed(2)),
      height: parseFloat(height.toFixed(2)),
    };
    board.apply({
      type: "set_node",
      path,
      properties: element,
      newProperties: newElement,
    });
  };

  private onContentChange = (
    board: Board,
    element: RichTextElement,
    value: Descendant[],
  ) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const newElement = {
      ...element,
      content: value,
    };
    board.apply({
      type: "set_node",
      path,
      properties: element,
      newProperties: newElement,
    });
  };

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
