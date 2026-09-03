import type Board from "../../Board";
import type { BoardElement, MindNodeElement, Operation } from "../../types";
import { SnapBehavior } from "../../types/capabilities";
import { BoardUtil, MindUtil, PathUtil } from "../../utils";
import type { InteractionState } from "../InteractionState";

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

/**
 * 键盘方向键连续移动选中元素（原 MovePlugin 的键盘部分）。
 * 按住方向键时以 60ms 间隔持续移动，alt 开启精确模式（步长 1px）。
 */
export class KeyboardMoveState implements InteractionState {
  readonly name = "keyboard-move";
  isFinished = false;

  private arrowKeyMoveInterval: number | null = null;
  private currentArrowKey: string | null = null;
  private isPreciseMode = false;

  /** 路由层裁决：方向键按下且存在选中元素时进入 */
  static shouldEnter(board: Board, event: KeyboardEvent): boolean {
    return (
      !board.presentationManager.isPresentationMode &&
      ARROW_KEYS.includes(event.key) &&
      board.selection.selectedElements.length > 0
    );
  }

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;

    // 检测精确模式 (alt/option键)
    if (e.altKey && !this.isPreciseMode) {
      this.isPreciseMode = true;
    }

    if (
      ARROW_KEYS.includes(e.key) &&
      board.selection.selectedElements.length > 0
    ) {
      // 阻止默认行为（避免页面滚动）
      e.preventDefault();

      // 如果是新的方向键或者没有正在进行的移动，开始新的持续移动
      if (
        this.currentArrowKey !== e.key ||
        this.arrowKeyMoveInterval === null
      ) {
        this.startContinuousArrowMove(board, e.key);
      }
    }
  }

  onKeyUp(e: KeyboardEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;

    // 检测精确模式结束
    if (!e.altKey && this.isPreciseMode) {
      this.isPreciseMode = false;
    }

    // 如果释放的是当前激活的方向键，停止持续移动
    if (this.currentArrowKey === e.key) {
      this.stopContinuousArrowMove();

      // 移动结束时触发事件
      board.emit("element:move-end");
      this.isFinished = true;
    }
  }

  onExit() {
    this.stopContinuousArrowMove();
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

  // 处理方向键移动
  private handleArrowKeyNavigation(board: Board, key: string) {
    if (board.presentationManager.isPresentationMode) return false;

    const moveDistance = this.isPreciseMode ? 1 : 5;
    let offsetX = 0;
    let offsetY = 0;

    switch (key) {
      case "ArrowUp":
        offsetY = -moveDistance;
        break;
      case "ArrowDown":
        offsetY = moveDistance;
        break;
      case "ArrowLeft":
        offsetX = -moveDistance;
        break;
      case "ArrowRight":
        offsetX = moveDistance;
        break;
      default:
        return false;
    }

    return this.moveSelectedElementsByOffset(board, offsetX, offsetY);
  }

  // 开始持续移动
  private startContinuousArrowMove(board: Board, key: string) {
    if (board.presentationManager.isPresentationMode) return;

    // 停止之前的移动
    this.stopContinuousArrowMove();

    this.currentArrowKey = key;
    // 立即执行一次移动
    this.handleArrowKeyNavigation(board, key);

    // 设置定时器持续移动
    this.arrowKeyMoveInterval = window.setInterval(() => {
      if (this.currentArrowKey) {
        this.handleArrowKeyNavigation(board, this.currentArrowKey);
      }
    }, 60);
  }

  // 停止持续移动
  private stopContinuousArrowMove() {
    if (this.arrowKeyMoveInterval !== null) {
      clearInterval(this.arrowKeyMoveInterval);
      this.arrowKeyMoveInterval = null;
      this.currentArrowKey = null;
    }
  }
}
