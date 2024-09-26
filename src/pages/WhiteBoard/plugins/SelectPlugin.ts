import { BoardElement, IBoardPlugin, Board } from "../types";
import { BoardUtil, PointUtil } from "../utils";
import { SelectTransforms } from "../transforms";

export class SelectPlugin implements IBoardPlugin {
  name = "select";
  startPoint: { x: number, y: number } | null = null;
  hitElements: BoardElement[] | null = null;
  moved = false;

  onPointerDown(e: PointerEvent, board: Board) {
    // 如果按下的是右键
    if (e.button === 2) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    // 缩放，禁止选择
    const hitResizeHandle = PointUtil.getHitResizeHandle(board, startPoint);
    if (hitResizeHandle) return;

    this.hitElements = BoardUtil.getHitElements(board, startPoint.x, startPoint.y);

    this.startPoint = startPoint;

    SelectTransforms.updateSelectArea(board, {
      selectArea: {
        anchor: startPoint,
        focus: startPoint
      },
      selectedElements: this.hitElements && this.hitElements.length > 0 ? board.selection.selectedElements : []
    });
  }
  onPointerMove(e: PointerEvent, board: Board) {
    if (this.startPoint) {
      const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!endPoint) {
        return;
      }

      if (!this.moved && (Math.abs(endPoint.x - this.startPoint.x) > 3 ||Math.abs(endPoint.y - this.startPoint.y) > 3)) {
        this.moved = true;
      }
      if (this.hitElements && this.hitElements.length > 0) return;

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
      let selectedElements: BoardElement[] = board.selection.selectedElements;
      if (!this.moved && this.hitElements && this.hitElements.length > 0) {
        selectedElements = [this.hitElements[0]];
      }
      SelectTransforms.updateSelectArea(board, {
        selectArea: null,
        selectedElements
      });
      this.startPoint = null;
      this.moved = false;
      this.hitElements = null;
    }
  }
}

export default SelectPlugin;