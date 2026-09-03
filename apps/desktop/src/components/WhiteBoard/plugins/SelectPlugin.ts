import { BoardElement, IBoardPlugin, Board } from "../types";
import { BoardUtil, deleteBoardElements } from "../utils";
import { SelectTransforms } from "../transforms";
import isHotkey from "is-hotkey";

/**
 * 选择相关的键盘命令（mod+a 全选、delete/backspace 删除选中）。
 * 点选/框选/拖拽手势已迁入交互内核（interactions/states/SelectingState）。
 */
export class SelectPlugin implements IBoardPlugin {
  name = "select";

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
      // 检查事件目标是否是可编辑元素
      const target = document.activeElement as HTMLElement;
      const isEditable =
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.closest("[contenteditable='true']") !== null ||
        target.closest("[role='textbox']") !== null;

      if (
        isEditable ||
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
