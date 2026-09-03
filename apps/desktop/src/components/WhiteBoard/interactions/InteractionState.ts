import type Board from "../Board";

/**
 * 交互状态：输入手势（拖拽、框选、平移、键盘连续移动等）在内核中的实现单元。
 * 状态由 InteractionManager 在手势开始时裁决进入，手势结束后销毁；
 * pointerdown 的仲裁发生在状态创建之前（见 InteractionManager），因此状态本身
 * 只接收延续事件（move/up/键盘）。
 *
 * 消费语义：处理器返回 true 表示该事件已被手势完全处理，Board 将跳过旧的插件
 * 广播（等价于旧机制中插件 onXxx 返回 false 的中断，但方向由内核裁决）。
 */
export interface InteractionState {
  /** 状态名（调试与外部查询用） */
  readonly name: string;

  /**
   * 手势是否已结束。由状态自己置位，InteractionManager 在每次路由后检查并销毁状态。
   * 指针手势在 pointerup 后由 InteractionManager 直接销毁的场合无需置位。
   */
  isFinished?: boolean;

  /** 状态被销毁时调用（清理定时器等资源） */
  onExit?(board: Board): void;

  onPointerMove?(event: PointerEvent, board: Board): boolean | void;
  onPointerUp?(event: PointerEvent, board: Board): boolean | void;
  onGlobalPointerMove?(event: PointerEvent, board: Board): boolean | void;
  onGlobalPointerUp?(event: PointerEvent, board: Board): boolean | void;
  onGlobalPointerCancel?(event: PointerEvent, board: Board): boolean | void;
  onKeyDown?(event: KeyboardEvent, board: Board): boolean | void;
  onKeyUp?(event: KeyboardEvent, board: Board): boolean | void;
}
