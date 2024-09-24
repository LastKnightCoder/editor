import Board, { BoardElement, IBoardPlugin } from "@/pages/WhiteBoard/Board.ts";
import BoardUtil from "@/pages/WhiteBoard/BoardUtil.ts";
import { SelectTransforms } from "@/pages/WhiteBoard/transforms";
import PointUtil from "@/pages/WhiteBoard/PointUtil.ts";

export class SelectPlugin implements IBoardPlugin {
  name = "select";
  startPoint: { x: number, y: number } | null = null;

  onPointerDown(e: PointerEvent, board: Board) {
    // 如果按下的是右键
    if (e.button === 2) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    const hitElements = BoardUtil.getHitElements(board, startPoint.x, startPoint.y);
    if (hitElements.length > 0) {
      return;
    }

    this.startPoint = startPoint;

    SelectTransforms.updateSelectArea(board, {
      selectArea: {
        anchor: startPoint,
        focus: startPoint
      },
      selectedElements: []
    });
  }
  onPointerMove(e: PointerEvent, board: Board) {
    if (this.startPoint) {
      const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!endPoint) {
        return;
      }

      const selectArea = {
        anchor: this.startPoint,
        focus: endPoint
      };

      const selectedElements: BoardElement[] = [];
      BoardUtil.dfs(board, (node) => {
        if (board.isElementSelected(node, selectArea)) {
          selectedElements.push(node);
        }
      });

      SelectTransforms.updateSelectArea(board, {
        selectArea,
        selectedElements
      });
    }
  }
  onPointerUp(_e: PointerEvent, board: Board) {
    if (this.startPoint) {
      SelectTransforms.updateSelectArea(board, {
        selectArea: null,
      });
      this.startPoint = null;
    }
  }
}

export default SelectPlugin;