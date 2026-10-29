import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_DELAY_MS, useHoldGesture, type HoldGestureHandlers } from "../useHoldGesture";

/** jsdom 不一定有 PointerEvent，用 MouseEvent 补上 pointerId */
function pointer(type: string, init: { pointerId?: number; x?: number; y?: number } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  return event;
}

/** ✕ 位于 (100,100)-(150,150) */
const CANCEL_RECT = { left: 100, top: 100, right: 150, bottom: 150, width: 50, height: 50 };

let latest: ReturnType<typeof useHoldGesture>;

function Harness({ handlers }: { handlers: HoldGestureHandlers }) {
  const cancelRef = useRef<HTMLDivElement | null>(null);
  latest = useHoldGesture(handlers, cancelRef);
  return (
    <>
      <button type="button" data-testid="trigger" {...latest.bind} />
      <div
        ref={node => {
          cancelRef.current = node;
          if (node)
            node.getBoundingClientRect = () => ({ ...CANCEL_RECT, x: 100, y: 100 }) as DOMRect;
        }}
      />
    </>
  );
}

describe("useHoldGesture", () => {
  let host: HTMLDivElement;
  let root: Root;
  let handlers: { [K in keyof HoldGestureHandlers]: ReturnType<typeof vi.fn> };

  const trigger = () => host.querySelector<HTMLButtonElement>('[data-testid="trigger"]')!;
  const press = (pointerId = 1) => {
    const event = pointer("pointerdown", { pointerId });
    act(() => {
      trigger().dispatchEvent(event);
    });
    return event;
  };
  const onWindow = (type: string, init?: Parameters<typeof pointer>[1]) =>
    act(() => {
      window.dispatchEvent(pointer(type, init));
    });
  const hold = () =>
    act(() => {
      vi.advanceTimersByTime(HOLD_DELAY_MS);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = { onHoldStart: vi.fn(), onRelease: vi.fn(), onCancel: vi.fn(), onTap: vi.fn() };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness handlers={handlers as HoldGestureHandlers} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("按下即 preventDefault，不抢编辑器焦点", () => {
    expect(press().defaultPrevented).toBe(true);
  });

  it("不足 200ms 松手视为短按", () => {
    press();
    act(() => vi.advanceTimersByTime(HOLD_DELAY_MS - 1));
    onWindow("pointerup");
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onHoldStart).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(HOLD_DELAY_MS));
    expect(handlers.onHoldStart).not.toHaveBeenCalled();
  });

  it("按满 200ms 开始录音，window 上松手提交", () => {
    press();
    hold();
    expect(handlers.onHoldStart).toHaveBeenCalledTimes(1);
    expect(latest.holding).toBe(true);
    onWindow("pointerup", { x: 10, y: 10 });
    expect(handlers.onRelease).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(latest.holding).toBe(false);
  });

  it("滑入 ✕ 命中区（含放宽半径）进入取消态，在此松手取消", () => {
    press();
    hold();
    onWindow("pointermove", { x: 90, y: 90 });
    expect(latest.cancelArmed).toBe(true);
    onWindow("pointermove", { x: 10, y: 10 });
    expect(latest.cancelArmed).toBe(false);
    onWindow("pointermove", { x: 120, y: 120 });
    expect(latest.cancelArmed).toBe(true);
    onWindow("pointerup", { x: 120, y: 120 });
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onRelease).not.toHaveBeenCalled();
    expect(latest.cancelArmed).toBe(false);
  });

  it("未进入录音前移动不进入取消态", () => {
    press();
    onWindow("pointermove", { x: 120, y: 120 });
    expect(latest.cancelArmed).toBe(false);
  });

  it("pointercancel 在录音中取消，录音前不触发回调", () => {
    press();
    hold();
    onWindow("pointercancel");
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);

    press();
    onWindow("pointercancel");
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it("忽略其他手指的事件", () => {
    press(1);
    hold();
    press(2);
    onWindow("pointermove", { pointerId: 2, x: 120, y: 120 });
    expect(latest.cancelArmed).toBe(false);
    onWindow("pointerup", { pointerId: 2 });
    onWindow("pointercancel", { pointerId: 2 });
    expect(handlers.onRelease).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
    expect(handlers.onHoldStart).toHaveBeenCalledTimes(1);
    onWindow("pointerup", { pointerId: 1 });
    expect(handlers.onRelease).toHaveBeenCalledTimes(1);
  });

  it("abort 结束手势且不触发回调", () => {
    press();
    hold();
    act(() => latest.abort());
    expect(latest.holding).toBe(false);
    onWindow("pointerup");
    expect(handlers.onRelease).not.toHaveBeenCalled();
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it("卸载后移除 window 监听并清掉计时器", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    press();
    act(() => root.unmount());
    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]));
    act(() => vi.advanceTimersByTime(HOLD_DELAY_MS));
    window.dispatchEvent(pointer("pointerup"));
    expect(handlers.onHoldStart).not.toHaveBeenCalled();
    expect(handlers.onTap).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
