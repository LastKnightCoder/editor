import { BoardElement, IBoardPlugin, Board, ECreateBoardElementType } from "../types";
import { BoardUtil, PathUtil, PointUtil } from "../utils";
import { SelectTransforms } from "../transforms";
import isHotkey from "is-hotkey";

export class SelectPlugin implements IBoardPlugin {
  name = "select";
  startPoint: { x: number, y: number } | null = null;
  hitElements: BoardElement[] | null = null;
  moved = false;

  onPointerDown(e: PointerEvent, board: Board) {
    if (board.currentCreateType !== ECreateBoardElementType.None) {
      return;
    }
    
    // 如果按下的是右键
    if (e.button === 2) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    this.hitElements = BoardUtil.getHitElements(board, startPoint.x, startPoint.y);

    this.startPoint = startPoint;

    SelectTransforms.updateSelectArea(board, {
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

      // 选中的情况，要么是移动元素，要么是点选，在鼠标抬起时处理点选，移动元素在 MovePlugin 中
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
  onGlobalPointerUp(_e: PointerEvent, board: Board) {
    if (this.startPoint) {
      let selectedElements: BoardElement[] = board.selection.selectedElements;
      if (!this.moved && this.hitElements && this.hitElements.length > 0) {
        selectedElements = [this.hitElements[this.hitElements.length - 1]];
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
  onKeyDown(e: KeyboardEvent, board: Board) {
    if (board.selection.selectedElements.length === 0) return;
    const selectedElements = board.selection.selectedElements;
    if (isHotkey(['delete', 'backspace'], e)) {
      for (const element of selectedElements) {
        const path = PathUtil.getPathByElement(board, element);
        if (!path) continue;
        board.apply({
          type: 'remove_node',
          path,
          node: element
        })
      }
      SelectTransforms.updateSelectArea(board, {
        selectArea: null,
        selectedElements: []
      });
    }
  }
}

export default SelectPlugin;