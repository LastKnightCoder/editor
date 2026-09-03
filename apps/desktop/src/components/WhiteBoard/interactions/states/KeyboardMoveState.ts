import type Board from "../../Board";
import type { BoardElement, MindNodeElement, Operation } from "../../types";
import { SnapBehavior } from "../../types/capabilities";
import { BoardUtil, MindUtil, PathUtil } from "../../utils";
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
  private moveSelectedElementsByOffset(
    board: Board,
    offsetX: number,
    offsetY: number,
  ) {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return false;

    const operations: Operation[] = [];
    const movedElements: BoardElement[] = [];

    selectedElements.forEach((element) => {
      const capService = board.capabilityService;
      // 使用 board.moveElement 方法获取移动后的元素位置
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (path) {
          const snapCap = capService.getSnapCapability(movedElement.type);
          const shouldTranslateSubtree =
            capService.shouldMoveWithChildren(movedElement) ||
            (snapCap.behavior === SnapBehavior.RootOnly &&
              Boolean(snapCap.moveAll) &&
              Array.isArray(movedElement.children) &&
              movedElement.children.length > 0);
          if (
            shouldTranslateSubtree &&
            typeof element.x === "number" &&
            typeof element.y === "number" &&
            typeof movedElement.x === "number" &&
            typeof movedElement.y === "number"
          ) {
            const dx = movedElement.x - element.x;
            const dy = movedElement.y - element.y;
            operations.push(
              ...BoardUtil.buildTranslateSubtreeOps(element, path, dx, dy),
            );
          } else {
            operations.push(
              ...BoardUtil.diffNodePatchOnly(element, movedElement, path),
            );
          }
          movedElements.push(movedElement);

          // 对于 RootOnly 吸附类型的元素（如 mind-node），需要把所有子节点都添加到 movedElements
          if (snapCap.behavior === SnapBehavior.RootOnly && snapCap.isRoot) {
            if (snapCap.isRoot(movedElement)) {
              // 把所有的子节点都移动添加到元素中
              MindUtil.dfs(movedElement as MindNodeElement, {
                before: (node: MindNodeElement) => {
                  if (MindUtil.isRoot(node)) return;
                  movedElements.push(node);
                },
              });
            }
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
        false,
      );

      board.emit("element:move", movedElements);
      return true;
    }

    return false;
  }
}
