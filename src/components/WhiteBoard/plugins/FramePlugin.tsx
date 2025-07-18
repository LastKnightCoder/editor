import {
  Board,
  BoardElement,
  EHandlerPosition,
  IBoardPlugin,
  Point,
  FrameElement,
  Operation,
} from "../types";
import { CommonPlugin } from "./CommonPlugin";
import { FrameUtil, PathUtil, BoardUtil } from "../utils";
import Frame from "../components/Frame";

export class FramePlugin extends CommonPlugin implements IBoardPlugin {
  name = "frame";

  moveElement(
    _board: Board,
    element: FrameElement,
    dx: number,
    dy: number,
  ): BoardElement | null {
    return FrameUtil.moveAll(element, dx, dy);
  }

  protected onResize(
    board: Board,
    element: FrameElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio = false,
    isAdsorb = false,
  ) {
    const updatedFrame = Object.assign(
      {},
      super.onResize(
        board,
        element,
        position,
        startPoint,
        endPoint,
        isPreserveRatio,
        isAdsorb,
      ),
    );

    if (Object.keys(updatedFrame).length === 0) return;

    const ops: Operation[] = [];

    const newElementsInArea = board.children.filter(
      (boardElement: BoardElement) => {
        if (boardElement.type === "frame" || boardElement.type === "arrow")
          return false;

        const parent = BoardUtil.getParent(board, boardElement);
        if (parent && parent.type === "frame") return false;

        return FrameUtil.isElementInFrame(boardElement, updatedFrame);
      },
    );

    newElementsInArea.forEach((boardElement) => {
      const path = PathUtil.getPathByElement(board, boardElement);
      if (!path) return;
      ops.push({
        type: "remove_node",
        path,
        node: boardElement,
      });
    });

    const outChildren = element.children.filter((child) => {
      return !FrameUtil.isElementInFrame(child, updatedFrame);
    });

    outChildren.forEach((child) => {
      ops.push({
        type: "insert_node",
        path: [board.children.length],
        node: child,
      });
    });

    updatedFrame.children = element.children.filter((child) => {
      return !outChildren.some((outChild) => outChild.id === child.id);
    });
    updatedFrame.children = [...updatedFrame.children, ...newElementsInArea];

    const framePath = PathUtil.getPathByElement(board, element);
    if (framePath) {
      ops.push({
        type: "set_node",
        path: framePath,
        properties: element,
        newProperties: updatedFrame,
      });
    }

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }

  protected onResizeEnd(board: Board) {
    if (this.originResizeElement && this.originResizeElement.type === "frame") {
      const frame = this.originResizeElement as FrameElement;
      const newestFrame = BoardUtil.getElementById(board, frame.id);

      if (newestFrame && newestFrame.autoResize) {
        const newBounds = FrameUtil.calculateFrameBounds(
          newestFrame as FrameElement,
        );
        const framePath = PathUtil.getPathByElement(board, frame);

        if (framePath) {
          board.apply([
            {
              type: "set_node",
              path: framePath,
              properties: newestFrame,
              newProperties: {
                ...newestFrame,
                ...newBounds,
              },
            },
          ]);
        }
      }
    }

    super.onResizeEnd(board);
  }

  render(
    _board: Board,
    { element, children }: { element: FrameElement; children?: any },
  ) {
    return (
      <g key={element.id}>
        <Frame
          element={element}
          onResize={this.onResize.bind(this)}
          onResizeStart={this.onResizeStart.bind(this)}
          onResizeEnd={this.onResizeEnd.bind(this)}
        />
        {children}
      </g>
    );
  }
}
