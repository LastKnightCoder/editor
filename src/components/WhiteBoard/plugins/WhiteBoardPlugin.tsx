import { Board, IBoardPlugin, EHandlerPosition, Point } from "../types";
import { getResizedBBox, PathUtil } from "../utils";
import WhiteBoardCard from "../components/WhiteBoardCard";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

export interface WhiteBoardElement extends CommonElement {
  type: "whiteboard";
  whiteBoardContentId: number;
  name: string;
  description?: string;
  snapshot?: string;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  fill?: string;
  fillOpacity?: number;
  theme?: "light" | "dark";
}

export class WhiteBoardPlugin extends CommonPlugin implements IBoardPlugin {
  name = "whiteboard";

  constructor() {
    super();
    this.onResize = this.onResize.bind(this);
  }

  onResize(
    board: Board,
    element: WhiteBoardElement,
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

  render(board: Board, { element }: { element: WhiteBoardElement }) {
    return <WhiteBoardCard key={element.id} board={board} element={element} />;
  }
}
