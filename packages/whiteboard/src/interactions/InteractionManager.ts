import type Board from "../Board";
import type { IBoardPlugin } from "../types";
import type { Operation } from "../types/operation";
import { BoardUtil, PointUtil } from "../utils";
import type { InteractionState } from "./InteractionState";
import { CreatingState } from "./states/CreatingState";
import { DraggingState } from "./states/DraggingState";
import { KeyboardMoveState } from "./states/KeyboardMoveState";
import { ViewportMoveState } from "./states/ViewportMoveState";
import { PanningState } from "./states/PanningState";
import { SelectingState } from "./states/SelectingState";
import { ARROW_KEYS } from "./states/ContinuousArrowMoveState";
import { ResizingState, type ResizeCallbacks } from "./states/ResizingState";
import { claimBoardPointer } from "../utils/events";
import { BOARD_TO_CONTAINER } from "../constants/map";

/**
 * 交互内核：输入手势的唯一裁决与路由层。
 *
 * 职责边界（双轨过渡期）：
 * - 指针/键盘事件先路由给进行中的手势状态，状态消费的事件不再走插件广播；
 *   未接管的事件回落到旧的插件广播，广播被插件中断（return false）时同样
 *   不开启新手势，保证与旧路径行为一致；
 * - 拖拽/点选框选/右键平移/方向键移动（元素与视口）已收编为内核手势状态；
 *   元素类型自定义手势通过插件的 claimPointerGesture 声明接管（如思维导图拖拽）。
 */
export class InteractionManager {
  /** 指针手势状态（拖拽/框选/平移等），同一时刻至多一个 */
  private pointerState: InteractionState | null = null;
  /** 键盘手势状态（方向键连续移动等），与指针手势相互独立 */
  private keyState: InteractionState | null = null;

  constructor(private board: Board) {}

  private resizePreviewState: ResizingState | null = null;
  get resizePreview() {
    return this.resizePreviewState;
  }
  runResizePreview(state: ResizingState, run: () => void) {
    const previous = this.resizePreviewState;
    this.resizePreviewState = state;
    try {
      run();
    } finally {
      this.resizePreviewState = previous;
    }
  }
  startResize(event: PointerEvent, callbacks: ResizeCallbacks): (() => void) | undefined {
    if (
      event.button !== 0 ||
      this.pointerState ||
      this.keyState ||
      this.board.readonly ||
      !this.board.captureSubmission()() ||
      this.board.isCreating() ||
      this.board.presentationManager.isPresentationMode
    )
      return;
    const point = PointUtil.screenToViewPort(this.board, event.clientX, event.clientY);
    if (!point || !claimBoardPointer(this.board, event)) return;
    const state = new ResizingState(this.board, event, point, callbacks);
    this.pointerState = state;
    this.board.document?.beginGesture();
    event.preventDefault();
    event.stopPropagation();
    BOARD_TO_CONTAINER.get(this.board)?.focus({ preventScroll: true });
    try {
      state.begin();
    } catch (error) {
      this.exitPointerState();
      throw error;
    }
    return () => {
      if (this.pointerState === state) this.exitPointerState();
    };
  }
  cancelResize(): boolean {
    if (!(this.pointerState instanceof ResizingState)) return false;
    this.exitPointerState();
    return true;
  }
  hasResizeConflict(operations: readonly Operation[]) {
    return this.pointerState instanceof ResizingState && this.pointerState.conflicts(operations);
  }

  get activePointerState(): InteractionState | null {
    return this.pointerState;
  }

  get activeKeyState(): InteractionState | null {
    return this.keyState;
  }

  /** 创建手势进行中：高频 pointermove 需绕过容器节流直驱手势（供渲染层入口判断） */
  isCreateGestureActive(): boolean {
    return this.pointerState instanceof CreatingState;
  }

  /**
   * pointerdown 最前置仲裁：创建型工具（element 字段）激活时由创建手势接管，
   * 整个手势消费指针事件，不进入 claimed gesture、插件广播与常规手势。
   */
  tryStartCreateGesture(event: PointerEvent): boolean {
    if (this.pointerState) return false;
    const state = CreatingState.tryStart(this.board, event);
    if (!state) return false;
    this.pointerState = state;
    this.board.document?.beginGesture();
    return true;
  }

  /**
   * pointerdown 广播前调用：询问命中元素的插件是否声明自定义手势
   * （原插件 onPointerDown 返回 false 抢占的显式化，不再依赖注册顺序）。
   * 返回 true 表示已接管并消费本次 pointerdown。
   */
  tryStartClaimedGesture(event: PointerEvent): boolean {
    if (this.pointerState) return false;
    const point = PointUtil.screenToViewPort(this.board, event.clientX, event.clientY);
    if (!point) return false;
    const hitElements = BoardUtil.getHitElements(this.board, point.x, point.y);
    const hitElement = hitElements.length > 0 ? hitElements[hitElements.length - 1] : null;
    if (!hitElement) return false;
    const plugin = this.board.getPlugin<IBoardPlugin>(hitElement.type);
    const state = plugin?.claimPointerGesture?.(this.board, event, hitElement) ?? null;
    if (state) {
      this.pointerState = state;
      this.board.document?.beginGesture({ realtime: true });
      return true;
    }
    return false;
  }

  /**
   * pointerdown 广播完整执行后调用：裁决本次按下开启哪种常规指针手势。
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
      const dragging = DraggingState.tryStart(this.board, event);
      selecting.attachDrag(dragging);
      this.pointerState = selecting;
      this.board.document?.beginGesture({ realtime: !!dragging });
      return;
    }
    const dragging = DraggingState.tryStart(this.board, event);
    if (dragging) {
      this.pointerState = dragging;
      this.board.document?.beginGesture({ realtime: true });
      return;
    }
    const panning = PanningState.tryStart(this.board, event);
    if (panning) {
      this.pointerState = panning;
      this.board.document?.beginGesture();
    }
  }

  routePointerMove(event: PointerEvent): boolean {
    return this.pointerState?.onPointerMove?.(event, this.board) === true;
  }

  routePointerUp(event: PointerEvent): boolean {
    const state = this.pointerState;
    if (!state) return false;
    const consumed = state.onPointerUp?.(event, this.board) === true;
    if (state.isFinished) {
      this.exitPointerState(true);
    }
    return consumed;
  }

  routeGlobalPointerMove(event: PointerEvent): boolean {
    return this.pointerState?.onGlobalPointerMove?.(event, this.board) === true;
  }

  routeGlobalPointerUp(event: PointerEvent): boolean {
    const state = this.pointerState;
    if (!state) return false;
    const consumed = state.onGlobalPointerUp?.(event, this.board) === true;
    if (state.isFinished) {
      this.exitPointerState(true);
    }
    return consumed;
  }

  routeGlobalPointerCancel(event: PointerEvent): boolean {
    const state = this.pointerState;
    if (!state) return false;
    const consumed = state.onGlobalPointerCancel?.(event, this.board) === true;
    if (state.isFinished) {
      this.exitPointerState();
    }
    return consumed;
  }

  /**
   * 键盘路由：进行中的指针手势可先处理（如 Escape 取消拖拽并消费）；
   * 方向键的移动目标在此单点裁决：有选中元素移动元素，否则平移视口
   * （原 MovePlugin 与 ViewPortPlugin 各自持有互补条件判断）。
   */
  routeKeyDown(event: KeyboardEvent): boolean {
    const pointerState = this.pointerState;
    if (pointerState) {
      const consumed = pointerState.onKeyDown?.(event, this.board) === true;
      if (this.pointerState?.isFinished) {
        this.exitPointerState();
      }
      if (consumed) return true;
    }

    if (this.keyState) {
      this.keyState.onKeyDown?.(event, this.board);
      return false;
    }
    if (!this.board.presentationManager.isPresentationMode && ARROW_KEYS.includes(event.key)) {
      if (this.board.selection.selectedElements.length > 0 && !this.board.captureSubmission()())
        return false;
      this.keyState =
        this.board.selection.selectedElements.length > 0
          ? new KeyboardMoveState()
          : new ViewportMoveState();
      this.board.document?.beginGesture();
      this.keyState.onKeyDown?.(event, this.board);
    }
    return false;
  }

  routeKeyUp(event: KeyboardEvent): boolean {
    const pointerState = this.pointerState;
    if (pointerState) {
      const consumed = pointerState.onKeyUp?.(event, this.board) === true;
      if (this.pointerState?.isFinished) {
        this.exitPointerState();
      }
      if (consumed) return true;
    }

    const state = this.keyState;
    if (!state) return false;
    state.onKeyUp?.(event, this.board);
    if (state.isFinished) {
      this.exitKeyState(true);
    }
    return false;
  }

  private exitPointerState(commit = false): void {
    const state = this.pointerState;
    this.pointerState = null;
    try {
      state?.onExit?.(this.board);
    } finally {
      if (state) this.board.document?.endGesture(commit);
    }
  }

  private exitKeyState(commit = false): void {
    const state = this.keyState;
    this.keyState = null;
    try {
      state?.onExit?.(this.board);
    } finally {
      if (state) this.board.document?.endGesture(commit);
    }
  }

  cancel(): void {
    this.exitPointerState();
    this.exitKeyState();
  }

  destroy(): void {
    this.cancel();
  }
}
