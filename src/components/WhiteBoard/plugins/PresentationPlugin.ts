import {
  Board,
  IBoardPlugin,
  BoardElement,
  ECreateBoardElementType,
} from "../types";
import { BoardUtil, PointUtil } from "../utils";
import { SelectTransforms } from "../transforms";

export type {
  PresentationSequence,
  PresentationFrame,
} from "../utils/PresentationManager";

export class PresentationPlugin implements IBoardPlugin {
  name = "presentation-plugin";

  // 框选起始点
  private startPoint: { x: number; y: number } | null = null;

  // 框选命中的元素
  private hitElements: BoardElement[] | null = null;

  // 是否移动了鼠标
  private moved = false;

  // 处理指针按下事件
  onPointerDown(e: PointerEvent, board: Board) {
    // 如果不是在创建序列模式或者当前有其他创建类型，则不处理
    if (
      !board.presentationManager.isCreatingSequence ||
      board.currentCreateType !== ECreateBoardElementType.None
    ) {
      return;
    }

    // 如果按下的是右键，不处理
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
    this.moved = false;

    // 清空当前选择
    SelectTransforms.updateSelectArea(board, {
      selectedElements:
        this.hitElements && this.hitElements.length > 0
          ? board.selection.selectedElements
          : [],
    });
  }

  // 处理指针移动事件
  onPointerMove(e: PointerEvent, board: Board) {
    if (!board.presentationManager.isCreatingSequence || !this.startPoint) {
      return;
    }

    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) {
      return;
    }

    if (
      !this.moved &&
      (Math.abs(endPoint.x - this.startPoint.x) > 3 ||
        Math.abs(endPoint.y - this.startPoint.y) > 3)
    ) {
      this.moved = true;
    }

    // 如果已经选中了元素，则不处理框选
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

  // 处理全局指针抬起事件
  onGlobalPointerUp(e: PointerEvent, board: Board) {
    if (!board.presentationManager.isCreatingSequence || !this.startPoint) {
      return;
    }

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

  // 处理键盘事件
  onKeyDown(e: KeyboardEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        board.presentationManager.nextFrame();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        board.presentationManager.prevFrame();
      } else if (e.key === "Escape") {
        board.presentationManager.stopPresentationMode();
        e.preventDefault();
      } else if (e.key === "f" || e.key === "F") {
        document.documentElement.requestFullscreen();
        e.preventDefault();
      }
    }
  }

  // 处理滚轮事件
  onWheel(e: WheelEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) {
      e.preventDefault();

      if (e.deltaY > 0) {
        // 向下滚动，显示下一帧
        board.presentationManager.nextFrame();
      } else if (e.deltaY < 0) {
        // 向上滚动，显示上一帧
        board.presentationManager.prevFrame();
      }
    }
  }
}

export default PresentationPlugin;
