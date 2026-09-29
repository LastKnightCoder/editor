/**
 * ResizeHandle 单测：拖动方向随 side · 夹在 [min, max] · 方向键 ±16 · 双击回默认 · 拖动起止回调。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "../ResizeHandle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ResizeHandle", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  const render = (ui: ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(ui));
    const handle = container.querySelector<HTMLDivElement>("[role=separator]")!;
    // jsdom 没有 pointer capture
    handle.setPointerCapture = () => undefined;
    return handle;
  };

  const pointer = (el: Element, type: string, clientX: number) =>
    act(() => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 }));
    });

  it("栏在右边：向左拖变宽，并夹在上限内", () => {
    const onChange = vi.fn();
    const onActive = vi.fn();
    const handle = render(
      <ResizeHandle
        value={380}
        min={320}
        max={560}
        onChange={onChange}
        onActiveChange={onActive}
        side="right"
        label="对话栏宽度"
      />
    );
    pointer(handle, "pointerdown", 500);
    expect(onActive).toHaveBeenLastCalledWith(true);
    pointer(handle, "pointermove", 440);
    expect(onChange).toHaveBeenLastCalledWith(440);
    pointer(handle, "pointermove", 100);
    expect(onChange).toHaveBeenLastCalledWith(560);
    pointer(handle, "pointerup", 100);
    expect(onActive).toHaveBeenLastCalledWith(false);
    // 松手后不再跟随
    onChange.mockClear();
    pointer(handle, "pointermove", 480);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("栏在左边：向右拖变宽，并夹在下限内", () => {
    const onChange = vi.fn();
    const handle = render(
      <ResizeHandle
        value={260}
        min={200}
        max={400}
        onChange={onChange}
        side="left"
        label="侧栏宽度"
      />
    );
    pointer(handle, "pointerdown", 260);
    pointer(handle, "pointermove", 300);
    expect(onChange).toHaveBeenLastCalledWith(300);
    pointer(handle, "pointermove", 0);
    expect(onChange).toHaveBeenLastCalledWith(200);
  });

  it("方向键按栏的方向 ±16，双击回默认宽度", () => {
    const onChange = vi.fn();
    const handle = render(
      <ResizeHandle
        value={380}
        min={320}
        max={560}
        defaultValue={400}
        onChange={onChange}
        side="right"
        label="对话栏宽度"
      />
    );
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(396);
    act(() => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(400);
  });
});
