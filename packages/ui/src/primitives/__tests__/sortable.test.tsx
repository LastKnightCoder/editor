/**
 * Sortable 单测：拖过阈值后按指针下的项排序 · 点击不触发 · Esc 取消 · 方向键前后移动 · disabled 全拦。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sortable } from "../Sortable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = ["a", "b", "c"];

/** jsdom 没有布局：按 x 坐标决定指针下是第几项 */
const pointAt = (container: HTMLElement) => {
  document.elementFromPoint = ((x: number) =>
    container.querySelectorAll("[data-sortable-index]")[Math.floor(x / 100)] ??
    null) as typeof document.elementFromPoint;
};

const pointer = (type: string, x: number, init: PointerEventInit = {}) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0, button: 0 });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  return event;
};

describe("Sortable", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  const render = (onMove: (from: number, to: number) => void, disabled = false) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <Sortable
          items={items}
          getKey={item => item}
          onMove={onMove}
          disabled={disabled}
          renderItem={(item, state) => (
            <button type="button" data-state={JSON.stringify(state.over)} {...state.handleProps}>
              {item}
            </button>
          )}
        />
      )
    );
    pointAt(container);
    return [...container.querySelectorAll("button")];
  };

  const drag = (handle: HTMLElement, from: number, to: number, finish = "pointerup") => {
    act(() => handle.dispatchEvent(pointer("pointerdown", from)));
    act(() => window.dispatchEvent(pointer("pointermove", to)));
    act(() => window.dispatchEvent(pointer(finish, to)));
  };

  it("拖过阈值后放到指针下的那一项，拖动中标出目标", () => {
    const onMove = vi.fn();
    const [first] = render(onMove);
    act(() => first.dispatchEvent(pointer("pointerdown", 10)));
    act(() => window.dispatchEvent(pointer("pointermove", 210)));
    expect(container!.querySelectorAll("[data-sortable-index]")[0].className).toContain(
      "opacity-40"
    );
    expect(container!.querySelectorAll("button")[2].dataset.state).toBe("true");
    act(() => window.dispatchEvent(pointer("pointerup", 210)));
    expect(onMove).toHaveBeenCalledWith(0, 2);
    expect(container!.querySelectorAll("[data-sortable-index]")[0].className).not.toContain(
      "opacity-40"
    );
  });

  it("没拖过阈值、放回原处或取消时不移动", () => {
    const onMove = vi.fn();
    const [first, second] = render(onMove);
    drag(first, 10, 12);
    drag(second, 110, 150);
    drag(first, 10, 210, "pointercancel");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("Esc 取消正在进行的拖动", () => {
    const onMove = vi.fn();
    const [first] = render(onMove);
    act(() => first.dispatchEvent(pointer("pointerdown", 10)));
    act(() => window.dispatchEvent(pointer("pointermove", 210)));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    act(() => window.dispatchEvent(pointer("pointerup", 210)));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("手柄上的方向键前后移动一位，越界不动", () => {
    const onMove = vi.fn();
    const [first, second] = render(onMove);
    const key = (target: HTMLElement, value: string) =>
      act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })));
    key(second, "ArrowLeft");
    key(second, "ArrowDown");
    key(first, "ArrowUp");
    expect(onMove.mock.calls).toEqual([
      [1, 0],
      [1, 2],
    ]);
  });

  it("disabled 时不能拖也不能用方向键", () => {
    const onMove = vi.fn();
    const [first] = render(onMove, true);
    drag(first, 10, 210);
    act(() =>
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    );
    expect(onMove).not.toHaveBeenCalled();
    expect(first.tabIndex).toBe(-1);
  });
});
