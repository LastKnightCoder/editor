import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

/** 按住达到该时长进入按住说，更短视为轻点 */
export const HOLD_DELAY_MS = 250;
/** ✕ 命中区在按钮外再放宽的半径，手指大致滑到即可 */
const CANCEL_SLOP_PX = 24;

export type HoldGestureHandlers = {
  /** 达到按住时长：开始录音 */
  onHoldStart(): void;
  /** 松手且不在 ✕ 内 */
  onRelease(): void;
  /** 在 ✕ 内松手，或系统打断手势 */
  onCancel(): void;
  /** 未达到按住时长就松手 */
  onTap(): void;
};

function isInside(target: HTMLElement | null, x: number, y: number) {
  if (!target) return false;
  const rect = target.getBoundingClientRect();
  return (
    x >= rect.left - CANCEL_SLOP_PX &&
    x <= rect.right + CANCEL_SLOP_PX &&
    y >= rect.top - CANCEL_SLOP_PX &&
    y <= rect.bottom + CANCEL_SLOP_PX
  );
}

/**
 * 轻点 / 按住二合一手势：不足 HOLD_DELAY_MS 松手为轻点；按住后在 window 上跟踪同一根手指，
 * 手指离开按钮也不中断，是否落在 ✕ 内按 cancelTargetRef 的实时位置判断。
 */
export function useHoldGesture(
  handlers: HoldGestureHandlers,
  cancelTargetRef: RefObject<HTMLElement | null>
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [holding, setHolding] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const pointerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const armedRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    detachRef.current?.();
    detachRef.current = null;
    pointerRef.current = null;
    holdingRef.current = false;
    armedRef.current = false;
    setHolding(false);
    setCancelArmed(false);
  }, []);

  useEffect(() => reset, [reset]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // 按下不抢编辑器焦点，避免语音模式下唤起键盘
      event.preventDefault();
      if (pointerRef.current !== null) return;
      pointerRef.current = event.pointerId;

      const move = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== pointerRef.current || !holdingRef.current) return;
        const armed = isInside(cancelTargetRef.current, next.clientX, next.clientY);
        if (armed !== armedRef.current) {
          armedRef.current = armed;
          setCancelArmed(armed);
          if (armed) navigator.vibrate?.(10);
        }
      };
      const up = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== pointerRef.current) return;
        const wasHolding = holdingRef.current;
        const armed = wasHolding && isInside(cancelTargetRef.current, next.clientX, next.clientY);
        reset();
        if (!wasHolding) handlersRef.current.onTap();
        else if (armed) handlersRef.current.onCancel();
        else handlersRef.current.onRelease();
      };
      const cancel = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== pointerRef.current) return;
        const wasHolding = holdingRef.current;
        reset();
        if (wasHolding) handlersRef.current.onCancel();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      detachRef.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
      };

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        holdingRef.current = true;
        setHolding(true);
        navigator.vibrate?.(15);
        handlersRef.current.onHoldStart();
      }, HOLD_DELAY_MS);
    },
    [cancelTargetRef, reset]
  );

  return {
    holding,
    cancelArmed,
    /** 绑定到触发按钮 */
    bind: {
      onPointerDown,
      onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
      onContextMenu: (event: { preventDefault(): void }) => event.preventDefault(),
      style: { touchAction: "none" as const },
    },
    /** 外部打断（例如服务报错）时结束手势，不触发回调 */
    abort: reset,
  };
}
