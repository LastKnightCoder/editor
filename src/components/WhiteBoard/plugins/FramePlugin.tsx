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

    // 处理移出 frame 的元素 - 使用 move_node 从 frame.children 移动到 board.children
    const outChildren = element.children.filter((child) => {
      return !FrameUtil.isElementInFrame(child, updatedFrame);
    });

    outChildren.forEach((child) => {
      const oldPath = PathUtil.getPathByElement(board, child);
      if (!oldPath) return;

      // 新路径：移动到 board.children 的末尾
      const newPath = [board.children.length];

      ops.push({
        type: "move_node",
        path: oldPath,
        newPath,
      });
    });

    const framePath = PathUtil.getPathByElement(board, element);
    if (!framePath) return;

    // 处理新进入 frame 的元素 - 使用 move_node 从 board.children 移动到 frame.children
    newElementsInArea.forEach((boardElement) => {
      const oldPath = PathUtil.getPathByElement(board, boardElement);
      if (!oldPath) return;

      const newPath = [...framePath, element.children.length];

      ops.push({
        type: "move_node",
        path: oldPath,
        newPath,
      });
    });

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
        const newFrame = {
          ...newestFrame,
          ...newBounds,
        };

        if (framePath) {
          board.apply([
            {
              type: "set_node",
              path: framePath,
              properties: newestFrame,
              newProperties: newFrame,
            },
            {
              type: "set_selection",
              properties: board.selection,
              newProperties: {
                selectedElements: [newFrame],
                selectArea: null,
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
