import {
  BoardElement,
  IBoardPlugin,
  Board,
  ECreateBoardElementType,
} from "../types";
import { BoardUtil, PointUtil, deleteBoardElements } from "../utils";
import { SelectTransforms } from "../transforms";
import isHotkey from "is-hotkey";

export class SelectPlugin implements IBoardPlugin {
  name = "select";
  startPoint: { x: number; y: number } | null = null;
  hitElements: BoardElement[] | null = null;
  moved = false;

  onPointerDown(e: PointerEvent, board: Board) {
    if (
      board.currentCreateType !== ECreateBoardElementType.None ||
      board.presentationManager.isPresentationMode ||
      board.presentationManager.isCreatingSequence
    ) {
      return;
    }

    // 如果按下的是右键
    if (e.button === 2) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    this.hitElements = BoardUtil.getHitElements(
      board,
      startPoint.x,
      startPoint.y,
    );

    this.startPoint = startPoint;

    SelectTransforms.updateSelectArea(board, {
      selectedElements:
        this.hitElements && this.hitElements.length > 0
          ? board.selection.selectedElements
          : [],
    });
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.startPoint) return;

    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) {
      return;
    }

    if (
      !this.moved &&
      Math.hypot(
        endPoint.x - this.startPoint.x,
        endPoint.y - this.startPoint.y,
      ) > 5
    ) {
      this.moved = true;
    }

    // 选中的情况，要么是移动元素，要么是点选，在鼠标抬起时处理点选，移动元素在 MovePlugin 中
    if (this.hitElements && this.hitElements.length > 0) return;

    const selectArea = {
      anchor: this.startPoint,
      focus: endPoint,
    };

    const selectedElements: BoardElement[] = [];
    BoardUtil.dfs(board, (node) => {
      if (board.isElementSelected(node, selectArea)) {
        selectedElements.push(node);
      }
    });

    SelectTransforms.updateSelectArea(board, {
      selectArea,
      selectedElements,
    });
  }
  onGlobalPointerUp(e: PointerEvent, board: Board) {
    if (!this.startPoint) return;

    let selectedElements: BoardElement[] = board.selection.selectedElements;

    const isMultiSelect = e.ctrlKey || e.metaKey;

    if (!this.moved && this.hitElements && this.hitElements.length > 0) {
      const clickedElement = this.hitElements[this.hitElements.length - 1];

      if (isMultiSelect) {
        // 多选模式下，如果点击的元素已经在选中列表中，则移除它；否则添加它
        const existingIndex = selectedElements.findIndex(
          (el) => el.id === clickedElement.id,
        );

        if (existingIndex >= 0) {
          // 元素已存在，移除它
          selectedElements = [
            ...selectedElements.slice(0, existingIndex),
            ...selectedElements.slice(existingIndex + 1),
          ];
        } else {
          // 元素不存在，添加它
          selectedElements = [...selectedElements, clickedElement];
        }
      } else {
        // 非多选模式，只选中当前点击的元素
        selectedElements = [clickedElement];
      }
    }

    // 确保选择区域被清除
    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements,
    });

    // 确保参考线被清除
    board.clearRefLines();

    // 重置状态
    this.startPoint = null;
    this.moved = false;
    this.hitElements = null;
  }
  onKeyDown(e: KeyboardEvent, board: Board) {
    // 实现mod+a全选功能
    if (isHotkey("mod+a", e)) {
      e.preventDefault();
      const allElements: BoardElement[] = [];
      BoardUtil.dfs(board, (node) => {
        allElements.push(node);
      });

      SelectTransforms.updateSelectArea(board, {
        selectArea: null,
        selectedElements: allElements,
      });

      return;
    }

    if (board.selection.selectedElements.length === 0) return;
    const selectedElements = board.selection.selectedElements;
    if (isHotkey(["delete", "backspace"], e)) {
      if (
        board.presentationManager.isPresentationMode ||
        board.presentationManager.isCreatingSequence ||
        board.isEditingElements.length > 0
      ) {
        return;
      }

      const deleted = deleteBoardElements(board, selectedElements);
      if (deleted) {
        SelectTransforms.updateSelectArea(board, {
          selectArea: null,
          selectedElements: [],
        });
      }
    }
  }
}

export default SelectPlugin;
