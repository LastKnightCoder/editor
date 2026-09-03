import type Board from "../Board";
import type { InteractionState } from "./InteractionState";
import { DraggingState } from "./states/DraggingState";
import { KeyboardMoveState } from "./states/KeyboardMoveState";
import { ViewportMoveState } from "./states/ViewportMoveState";
import { PanningState } from "./states/PanningState";
import { SelectingState } from "./states/SelectingState";
import { ARROW_KEYS } from "./states/ContinuousArrowMoveState";

/**
 * 交互内核：输入手势的唯一裁决与路由层。
 *
 * 职责边界（双轨过渡期）：
 * - 指针/键盘事件先路由给进行中的手势状态；未接管的手势回落到旧的插件广播，
 *   广播被插件中断（return false）时同样不开启新手势，保证与旧路径行为一致；
 * - 拖拽/点选框选/右键平移/方向键移动（元素与视口）已收编为内核手势状态。
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
   * pointerdown 广播完整执行后调用：裁决本次按下开启哪种指针手势。
   * 必须在广播之后（而非之前）仲裁，因为手势判定依赖选择插件在
   * pointerdown 阶段同步更新的选区状态。
   * 仲裁顺序（原注册顺序的显式化）：先选择手势（记录命中 + 更新选区），
   * 再在其内部尝试挂接拖拽阶段；选择手势守卫退出（如创建序列模式）时
   * 拖拽仍可独立开启；右键按下进入平移手势兜底。
   */
  tryStartPointerGesture(event: PointerEvent): void {
    if (this.pointerState) return;
    const selecting = SelectingState.tryStart(this.board, event);
    if (selecting) {
      selecting.attachDrag(DraggingState.tryStart(this.board, event));
      this.pointerState = selecting;
      return;
    }
    const dragging = DraggingState.tryStart(this.board, event);
    if (dragging) {
      this.pointerState = dragging;
      return;
    }
    const panning = PanningState.tryStart(this.board, event);
    if (panning) {
      this.pointerState = panning;
    }
  }

  routePointerMove(event: PointerEvent): void {
    this.pointerState?.onPointerMove?.(event, this.board);
  }

  routePointerUp(event: PointerEvent): void {
    const state = this.pointerState;
    if (!state) return;
    state.onPointerUp?.(event, this.board);
    if (state.isFinished) {
      this.exitPointerState();
    }
  }

  routeGlobalPointerUp(event: PointerEvent): void {
    const state = this.pointerState;
    if (!state) return;
    state.onGlobalPointerUp?.(event, this.board);
    if (state.isFinished) {
      this.exitPointerState();
    }
  }

  /**
   * 方向键的移动目标在此单点裁决：有选中元素移动元素，否则平移视口
   * （原 MovePlugin 与 ViewPortPlugin 各自持有互补条件判断）。
   */
  routeKeyDown(event: KeyboardEvent): void {
    if (this.keyState) {
      this.keyState.onKeyDown?.(event, this.board);
      return;
    }
    if (
      !this.board.presentationManager.isPresentationMode &&
      ARROW_KEYS.includes(event.key)
    ) {
      this.keyState =
        this.board.selection.selectedElements.length > 0
          ? new KeyboardMoveState()
          : new ViewportMoveState();
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
