import { act, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAutoScrollSpeed,
  resolveDropIndex,
  usePointerReorder,
  type PointerReorder,
} from "../usePointerReorder";

/** 5 项，每项高 46，紧挨排列 */
const RECTS = Array.from({ length: 5 }, (_, index) => ({ top: index * 46, height: 46 }));

function pointer(type: string, clientY: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientY, pointerId });
  return event;
}

function reactPointerDown(clientY: number) {
  const target = document.createElement("button");
  return {
    clientY,
    pointerId: 1,
    currentTarget: target,
    preventDefault: () => {},
  } as unknown as ReactPointerEvent;
}

describe("resolveDropIndex / resolveAutoScrollSpeed", () => {
  it("被拖项中心越过其他项中线时插入位变化", () => {
    expect(resolveDropIndex(RECTS, 1, 0)).toBe(1);
    expect(resolveDropIndex(RECTS, 1, 22)).toBe(1);
    expect(resolveDropIndex(RECTS, 1, 47)).toBe(2);
    expect(resolveDropIndex(RECTS, 1, -47)).toBe(0);
    expect(resolveDropIndex(RECTS, 0, 500)).toBe(4);
  });

  it("边缘区内按深入比例线性加速", () => {
    const viewport = { top: 100, bottom: 600 };
    expect(resolveAutoScrollSpeed(300, viewport, 64, 14)).toBe(0);
    expect(resolveAutoScrollSpeed(132, viewport, 64, 14)).toBe(-7);
    expect(resolveAutoScrollSpeed(90, viewport, 64, 14)).toBe(-14);
    expect(resolveAutoScrollSpeed(568, viewport, 64, 14)).toBe(7);
  });
});

describe("usePointerReorder", () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: PointerReorder;
  let container: HTMLDivElement;
  const onDrop = vi.fn();
  let frames: FrameRequestCallback[];

  let scrollByGetter = false;

  function Harness() {
    api = usePointerReorder({
      scrollContainer: scrollByGetter ? () => container : container,
      getItemRects: () => RECTS,
      onDrop,
    });
    return null;
  }

  beforeEach(() => {
    scrollByGetter = false;
    onDrop.mockClear();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400 }) as DOMRect;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("拖动计算插入位，松手回调 onDrop", () => {
    act(() => api.startDrag(0, reactPointerDown(100)));
    expect(api.dragging).toEqual({ from: 0, to: 0, offsetY: 0 });
    act(() => {
      window.dispatchEvent(pointer("pointermove", 200));
    });
    expect(api.dragging).toEqual({ from: 0, to: 2, offsetY: 100 });
    act(() => {
      window.dispatchEvent(pointer("pointerup", 200));
    });
    expect(api.dragging).toBeNull();
    expect(onDrop).toHaveBeenCalledWith(0, 2);
  });

  it("位置未变时不回调", () => {
    act(() => api.startDrag(2, reactPointerDown(100)));
    act(() => {
      window.dispatchEvent(pointer("pointermove", 110));
      window.dispatchEvent(pointer("pointerup", 110));
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("取消不触发 onDrop", () => {
    act(() => api.startDrag(0, reactPointerDown(100)));
    act(() => {
      window.dispatchEvent(pointer("pointermove", 250));
      window.dispatchEvent(pointer("pointercancel", 250));
    });
    expect(api.dragging).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("忽略其他指针", () => {
    act(() => api.startDrag(0, reactPointerDown(100)));
    act(() => {
      window.dispatchEvent(pointer("pointermove", 300, 2));
    });
    expect(api.dragging?.offsetY).toBe(0);
  });

  it("指针进入下边缘区时自动滚动，滚动增量计入位移", () => {
    act(() => api.startDrag(0, reactPointerDown(100)));
    act(() => {
      window.dispatchEvent(pointer("pointermove", 368));
    });
    expect(frames).toHaveLength(1);
    act(() => frames.shift()?.(0));
    expect(container.scrollTop).toBe(7);
    expect(api.dragging?.offsetY).toBe(268 + 7);
    // 回到中部即停止
    act(() => {
      window.dispatchEvent(pointer("pointermove", 200));
    });
    act(() => frames.shift()?.(0));
    expect(container.scrollTop).toBe(7);
    expect(frames).toHaveLength(0);
  });

  it("startDragAt：按记录的指针信息开始，捕获传入的 target", () => {
    const target = document.createElement("button");
    const setPointerCapture = vi.fn();
    target.setPointerCapture = setPointerCapture;
    act(() => api.startDragAt(1, { clientY: 100, pointerId: 3, target }));
    expect(setPointerCapture).toHaveBeenCalledWith(3);
    expect(api.dragging).toEqual({ from: 1, to: 1, offsetY: 0 });
    act(() => {
      window.dispatchEvent(pointer("pointermove", 200, 3));
      window.dispatchEvent(pointer("pointerup", 200, 3));
    });
    expect(onDrop).toHaveBeenCalledWith(1, 3);
  });

  it("cancelDrag 结束拖拽且不回调，之后的指针事件不再跟踪", () => {
    act(() => api.startDragAt(0, { clientY: 100, pointerId: 1, target: null }));
    act(() => {
      window.dispatchEvent(pointer("pointermove", 250));
    });
    act(() => api.cancelDrag());
    expect(api.dragging).toBeNull();
    act(() => {
      window.dispatchEvent(pointer("pointerup", 250));
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("scrollContainer 传函数时在拖拽中取值", () => {
    scrollByGetter = true;
    act(() => root.render(<Harness />));
    act(() => api.startDragAt(0, { clientY: 100, pointerId: 1, target: null }));
    act(() => {
      window.dispatchEvent(pointer("pointermove", 368));
    });
    act(() => frames.shift()?.(0));
    expect(container.scrollTop).toBe(7);
    expect(api.dragging?.offsetY).toBe(268 + 7);
  });
});
