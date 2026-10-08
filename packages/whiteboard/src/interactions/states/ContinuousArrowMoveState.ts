import type Board from "../../Board";
import type { InteractionState } from "../InteractionState";

export const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

/**
 * 方向键连续移动的公共基类：按住方向键以 60ms 间隔持续移动，
 * alt 开启精确模式（步长 1px，默认 5px）。
 * 子类通过 navigate 决定移动对象（选中元素或视口）。
 */
export abstract class ContinuousArrowMoveState implements InteractionState {
  abstract readonly name: string;
  isFinished = false;

  private arrowKeyMoveInterval: number | null = null;
  private currentArrowKey: string | null = null;
  private isPreciseMode = false;

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;

    // 检测精确模式 (alt/option键)
    if (e.altKey && !this.isPreciseMode) {
      this.isPreciseMode = true;
    }

    if (ARROW_KEYS.includes(e.key)) {
      // 阻止默认行为（避免页面滚动）
      e.preventDefault();

      // 如果是新的方向键或者没有正在进行的移动，开始新的持续移动
      if (this.currentArrowKey !== e.key || this.arrowKeyMoveInterval === null) {
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
      this.onMoveEnd(board);
      this.isFinished = true;
    }
  }

  onExit() {
    this.stopContinuousArrowMove();
  }

  /** 执行一次移动；返回 false 表示无法移动 */
  protected abstract navigate(board: Board, offsetX: number, offsetY: number): boolean;

  /** 持续移动结束（当前方向键释放）时调用 */
  protected onMoveEnd(_board: Board): void {}

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

    return this.navigate(board, offsetX, offsetY);
  }

  // 开始持续移动
  private startContinuousArrowMove(board: Board, key: string) {
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
