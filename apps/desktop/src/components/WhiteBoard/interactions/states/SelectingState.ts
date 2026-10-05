import type Board from "../../Board";
import { BoardElement, ECreateBoardElementType } from "../../types";
import {
  BoardUtil,
  PointUtil,
  collectGroupMembers,
  expandSelectionByGroup,
  getElementGroupId,
  isPointInAnySelectedGroupBounds,
} from "../../utils";
import { SelectTransforms } from "../../transforms";
import type { InteractionState } from "../InteractionState";
import { DraggingState } from "./DraggingState";

/**
 * 点选/框选手势（原 SelectPlugin 的指针部分）。
 * 一个复合手势状态：pointerdown 记录命中并更新选区；移动超过阈值后按命中情况
 * 分流为框选（未命中）或拖拽（命中，由内嵌的 DraggingState 阶段执行）；
 * 容器 pointerup 提交拖拽，document pointerup 收尾点选/框选。
 *
 * 拖拽阶段的仲裁必须发生在选区更新之后（原 MovePlugin 注册在 SelectPlugin 之后），
 * 该顺序由 attachDrag 在 tryStart 内部保证，不再依赖插件注册顺序。
 */
export class SelectingState implements InteractionState {
  readonly name = "selecting";
  isFinished = false;

  private startPoint: { x: number; y: number } | null = null;
  private hitElements: BoardElement[] | null = null;
  private hitSelectedGroupBounds = false;
  private moved = false;
  /** 命中元素时的拖拽阶段，容器 pointerup 提交后清空 */
  private drag: DraggingState | null = null;

  private constructor() {}

  /** pointerdown 仲裁（原 SelectPlugin.onPointerDown） */
  static tryStart(board: Board, e: PointerEvent): SelectingState | null {
    if (
      board.currentCreateType !== ECreateBoardElementType.None ||
      board.presentationManager.isPresentationMode ||
      board.presentationManager.isCreatingSequence
    ) {
      return null;
    }

    // 如果按下的是右键
    if (e.button === 2) {
      return null;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return null;

    const state = new SelectingState();
    state.hitElements = BoardUtil.getHitElements(board, startPoint.x, startPoint.y);
    state.startPoint = startPoint;
    const selectedElements = expandSelectionByGroup(board, board.selection.selectedElements);
    const isHitSelectedGroupBounds =
      state.hitElements.length === 0 &&
      isPointInAnySelectedGroupBounds(board, selectedElements, startPoint.x, startPoint.y);
    state.hitSelectedGroupBounds = isHitSelectedGroupBounds;

    SelectTransforms.updateSelectArea(board, {
      selectedElements:
        state.hitElements && state.hitElements.length > 0
          ? selectedElements
          : isHitSelectedGroupBounds
            ? selectedElements
            : [],
    });
    return state;
  }

  /** 挂接拖拽阶段；null 表示本次按下不构成拖拽（多选点击等） */
  attachDrag(drag: DraggingState | null): void {
    this.drag = drag;
  }

  onPointerMove(e: PointerEvent, board: Board) {
    this.updateBoxSelection(e, board);
    // 拖拽阶段独立于框选执行（原 MovePlugin.onPointerMove 在 SelectPlugin 之后广播）
    this.drag?.onPointerMove(e, board);
  }

  /** 容器 pointerup：提交拖拽阶段（原 MovePlugin.onPointerUp） */
  onPointerUp(e: PointerEvent, board: Board) {
    this.drag?.onPointerUp(e, board);
    this.drag = null;
  }

  /** document pointerup：点选/多选切换/框选收尾（原 SelectPlugin.onGlobalPointerUp） */
  onGlobalPointerUp(e: PointerEvent, board: Board) {
    if (!this.startPoint) return;

    let selectedElements: BoardElement[] = board.selection.selectedElements;

    const isMultiSelect = e.ctrlKey || e.metaKey;

    if (
      !this.hitSelectedGroupBounds &&
      !this.moved &&
      this.hitElements &&
      this.hitElements.length > 0
    ) {
      const clickedElement = this.hitElements[this.hitElements.length - 1];

      if (isMultiSelect) {
        // 多选模式下，如果点击的元素已经在选中列表中，则移除它；否则添加它
        const clickedGroupId = getElementGroupId(clickedElement);
        if (clickedGroupId) {
          const groupMembers = collectGroupMembers(board, clickedGroupId);
          const selectedIds = new Set(selectedElements.map(el => el.id));
          const isFullGroupSelected = groupMembers.every(member => selectedIds.has(member.id));

          if (isFullGroupSelected) {
            const groupMemberIds = new Set(groupMembers.map(el => el.id));
            selectedElements = selectedElements.filter(el => !groupMemberIds.has(el.id));
          } else {
            const merged = new Map<string, BoardElement>();
            selectedElements.forEach(el => merged.set(el.id, el));
            groupMembers.forEach(el => merged.set(el.id, el));
            selectedElements = Array.from(merged.values());
          }
        } else {
          const existingIndex = selectedElements.findIndex(el => el.id === clickedElement.id);

          if (existingIndex >= 0) {
            selectedElements = [
              ...selectedElements.slice(0, existingIndex),
              ...selectedElements.slice(existingIndex + 1),
            ];
          } else {
            selectedElements = [...selectedElements, clickedElement];
          }
        }
      } else {
        // 非多选模式，只选中当前点击的元素
        selectedElements = expandSelectionByGroup(board, [clickedElement]);
      }
    }

    selectedElements = expandSelectionByGroup(board, selectedElements);

    // 确保选择区域被清除
    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements,
    });

    board.snap.end();

    this.isFinished = true;
  }

  /**
   * 框选更新（原 SelectPlugin.onPointerMove）：
   * 命中元素或选中分组边界时让位（由拖拽阶段负责移动）。
   */
  private updateBoxSelection(e: PointerEvent, board: Board) {
    if (!this.startPoint) return;

    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) {
      return;
    }

    if (
      !this.moved &&
      Math.hypot(endPoint.x - this.startPoint.x, endPoint.y - this.startPoint.y) > 5
    ) {
      this.moved = true;
    }

    if ((this.hitElements && this.hitElements.length > 0) || this.hitSelectedGroupBounds) return;

    const selectArea = {
      anchor: this.startPoint,
      focus: endPoint,
    };

    const selectedElements = BoardUtil.getElementsInSelectArea(board, selectArea);

    const expandedSelectedElements = expandSelectionByGroup(board, selectedElements);

    SelectTransforms.updateSelectArea(board, {
      selectArea,
      selectedElements: expandedSelectedElements,
    });
  }
}
