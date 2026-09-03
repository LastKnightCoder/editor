import type Board from "../Board";
import type { InteractionState } from "./InteractionState";
import { DraggingState } from "./states/DraggingState";
import { KeyboardMoveState } from "./states/KeyboardMoveState";

/**
 * 交互内核：输入手势的唯一裁决与路由层。
 *
 * 职责边界（双轨过渡期）：
 * - 指针/键盘事件先路由给进行中的手势状态；未接管的手势回落到旧的插件广播，
 *   广播被插件中断（return false）时同样不开启新手势，保证与旧路径行为一致；
 * - 拖拽（原 MovePlugin）已收编为 DraggingState，其余手势在后续切片中迁入。
 */
export class InteractionManager {
  /** 指针手势状态（拖拽/框选/平移等），同一时刻至多一个 */
  private pointerState: InteractionState | null = null;
  /** 键盘手势状态（方向键连续移动等），与指针手势相互独立 */
  private keyState: InteractionState | null = null;

  constructor(private board: Board) {}

  get activePointerState(): InteractionState | null {
    return this.pointerState;
  }

  get activeKeyState(): InteractionState | null {
    return this.keyState;
  }

  /**
   * pointerdown 广播完整执行后调用：裁决本次按下是否开启指针手势。
   * 必须在广播之后（而非之前）仲裁，因为拖拽判定依赖选择插件在
   * pointerdown 阶段同步更新的选区状态。
   */
  tryStartPointerGesture(event: PointerEvent): void {
    if (this.pointerState) return;
    const state = DraggingState.tryStart(this.board, event);
    if (state) {
      this.pointerState = state;
    }
  }

  routePointerMove(event: PointerEvent): void {
    this.pointerState?.onPointerMove?.(event, this.board);
  }

  /** 指针手势在 pointerup 处理完成后销毁 */
  routePointerUp(event: PointerEvent): void {
    const state = this.pointerState;
    if (!state) return;
    state.onPointerUp?.(event, this.board);
    this.exitPointerState();
  }

  routeKeyDown(event: KeyboardEvent): void {
    if (this.keyState) {
      this.keyState.onKeyDown?.(event, this.board);
      return;
    }
    if (KeyboardMoveState.shouldEnter(this.board, event)) {
      this.keyState = new KeyboardMoveState();
      this.keyState.onKeyDown?.(event, this.board);
    }
  }

  routeKeyUp(event: KeyboardEvent): void {
    const state = this.keyState;
    if (!state) return;
    state.onKeyUp?.(event, this.board);
    if (state.isFinished) {
      this.exitKeyState();
    }
  }

  private exitPointerState(): void {
    const state = this.pointerState;
    this.pointerState = null;
    state?.onExit?.(this.board);
  }

  private exitKeyState(): void {
    const state = this.keyState;
    this.keyState = null;
    state?.onExit?.(this.board);
  }

  destroy(): void {
    this.exitPointerState();
    this.exitKeyState();
  }
}
