import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

/** 按住达到该时长算按住，更短松手视为轻点 */
export const HOLD_DELAY_MS = 250;
/** ✕ 命中区在按钮外再放宽的半径，手指大致滑到即可 */
const CANCEL_SLOP_PX = 24;

export type HoldGestureHandlers = {
  /** 开始录音：默认在达到按住时长时触发，immediate 下按下即触发 */
  onHoldStart(): void;
  /** 按住时长后松手且不在 ✕ 内 */
  onRelease(): void;
  /** 录音中在 ✕ 内松手，或系统打断手势 */
  onCancel(): void;
  /** 未达到按住时长就松手；immediate 下此时录音已开始，由调用方决定取消还是继续 */
  onTap(): void;
};

export type HoldGestureOptions = {
  /**
   * 按下即开始录音，不等按住时长，避免吞掉开头的字。
   * 适用于轻点也会录音、或轻点没有其他功能的按钮；轻点另有用途（如打开菜单）时不要开启。
   */
  immediate?: boolean;
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
 * 轻点 / 按住二合一手势：不足 HOLD_DELAY_MS 松手为轻点；按下后在 window 上跟踪同一根手指，
 * 手指离开按钮也不中断，是否落在 ✕ 内按 cancelTargetRef 的实时位置判断。
 * pressed 在录音开始时即为 true，holding 在达到按住时长后才为 true，供按住态界面避免轻点时闪一下。
 */
export function useHoldGesture(
  handlers: HoldGestureHandlers,
  cancelTargetRef: RefObject<HTMLElement | null>,
  options: HoldGestureOptions = {}
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const immediate = options.immediate ?? false;
  const [pressed, setPressed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const pointerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  /** 录音已开始（onHoldStart 已触发） */
  const startedRef = useRef(false);
  /** 已达到按住时长 */
  const holdingRef = useRef(false);
  const armedRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    detachRef.current?.();
    detachRef.current = null;
    pointerRef.current = null;
    startedRef.current = false;
    holdingRef.current = false;
    armedRef.current = false;
    setPressed(false);
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
        if (next.pointerId !== pointerRef.current || !startedRef.current) return;
        const armed = isInside(cancelTargetRef.current, next.clientX, next.clientY);
        if (armed !== armedRef.current) {
          armedRef.current = armed;
          setCancelArmed(armed);
          if (armed) navigator.vibrate?.(10);
        }
      };
      const up = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== pointerRef.current) return;
        const wasStarted = startedRef.current;
        const wasHolding = holdingRef.current;
        const armed = wasStarted && isInside(cancelTargetRef.current, next.clientX, next.clientY);
        reset();
        if (armed) handlersRef.current.onCancel();
        else if (!wasHolding) handlersRef.current.onTap();
        else handlersRef.current.onRelease();
      };
      const cancel = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== pointerRef.current) return;
        const wasStarted = startedRef.current;
        reset();
        if (wasStarted) handlersRef.current.onCancel();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      detachRef.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
      };

      const startRecording = () => {
        startedRef.current = true;
        setPressed(true);
        navigator.vibrate?.(15);
        handlersRef.current.onHoldStart();
      };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        holdingRef.current = true;
        setHolding(true);
        if (!startedRef.current) startRecording();
      }, HOLD_DELAY_MS);
      if (immediate) startRecording();
    },
    [cancelTargetRef, immediate, reset]
  );

  return {
    pressed,
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
