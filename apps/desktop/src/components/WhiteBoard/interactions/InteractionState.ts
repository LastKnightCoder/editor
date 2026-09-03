import type Board from "../Board";

/**
 * 交互状态：输入手势（拖拽、框选、平移、键盘连续移动等）在内核中的实现单元。
 * 状态由 InteractionManager 在手势开始时裁决进入，手势结束后销毁；
 * pointerdown 的仲裁发生在状态创建之前（见 InteractionManager.tryStartPointerGesture），
 * 因此状态本身只接收延续事件（move/up/键盘）。
 */
export interface InteractionState {
  /** 状态名（调试与外部查询用） */
  readonly name: string;

  /**
   * 手势是否已结束。由状态自己置位，InteractionManager 在每次路由后检查并销毁状态。
   * 指针手势在 pointerup 后由 InteractionManager 直接销毁，无需置位。
   */
  isFinished?: boolean;

  /** 状态被销毁时调用（清理定时器等资源） */
  onExit?(board: Board): void;

  onPointerMove?(event: PointerEvent, board: Board): void;
  onPointerUp?(event: PointerEvent, board: Board): void;
  onKeyDown?(event: KeyboardEvent, board: Board): void;
  onKeyUp?(event: KeyboardEvent, board: Board): void;
}
