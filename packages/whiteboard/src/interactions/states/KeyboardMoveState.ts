import type Board from "../../Board";
import type { BoardElement, Operation } from "../../types";
import { SnapBehavior } from "../../types/capabilities";
import { PathUtil } from "../../utils";
import { ContinuousArrowMoveState } from "./ContinuousArrowMoveState";

/**
 * 键盘方向键连续移动选中元素（原 MovePlugin 的键盘部分）。
 * 存在选中元素时按方向键进入（分界由 InteractionManager 单点裁决）。
 */
export class KeyboardMoveState extends ContinuousArrowMoveState {
  readonly name = "keyboard-move";

  protected navigate(board: Board, offsetX: number, offsetY: number): boolean {
    return this.moveSelectedElementsByOffset(board, offsetX, offsetY);
  }

  protected onMoveEnd(board: Board): void {
    board.emit("element:move-end");
  }

  // 执行元素移动 - 为键盘方向键移动服务
  private moveSelectedElementsByOffset(board: Board, offsetX: number, offsetY: number) {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return false;

    const capService = board.capabilityService;
    const operations: Operation[] = [];
    const movedElements: BoardElement[] = [];

    selectedElements.forEach(element => {
      // 使用 board.moveElement 方法获取移动后的元素位置
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (path) {
          // 子树元素生成整树平移 ops，普通元素只 patch 变化字段（能力判定在 service 内）
          operations.push(...capService.buildElementMoveOps(element, movedElement, path));
          movedElements.push(movedElement);

          // 对于 RootOnly 吸附类型的元素（如 mind-node 根），
          // 子树成员也要进入 movedElements（用于选区同步）
          const snapCap = capService.getSnapCapability(movedElement.type);
          if (snapCap.behavior === SnapBehavior.RootOnly && snapCap.isRoot?.(movedElement)) {
            movedElements.push(...capService.collectMoveSubtree(movedElement).slice(1));
          }
        }
      }
    });

    if (operations.length > 0) {
      // 应用操作更新元素
      board.apply(operations, false);

      // 更新selection中的选中元素，确保使用最新位置
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: board.selection.selectArea,
            selectedElements: movedElements,
          },
        },
        false
      );

      board.emit("element:move", movedElements);
      return true;
    }

    return false;
  }
}
