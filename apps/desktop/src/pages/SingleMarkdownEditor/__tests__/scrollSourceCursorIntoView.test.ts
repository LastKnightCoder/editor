import { describe, expect, it, vi } from "vitest";

import { scrollSourceCursorIntoView } from "../scrollSourceCursorIntoView";

const createContainer = (rect: { top: number; bottom: number }) => {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientTop", { value: 40 });
  Object.defineProperty(container, "clientHeight", { value: 400 });
  Object.defineProperty(container, "offsetHeight", { value: 480 });
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    ...rect,
    left: 0,
    right: 0,
    width: 0,
    height: rect.bottom - rect.top,
    x: 0,
    y: rect.top,
    toJSON: () => ({}),
  });
  return container;
};

describe("scrollSourceCursorIntoView", () => {
  it("滚动外层容器以显示底部的光标", () => {
    const container = createContainer({ top: 0, bottom: 480 });
    const editor = {
      getCursor: () => ({ line: 20, ch: 0 }),
      cursorCoords: () => ({ top: 450, bottom: 470, left: 0, right: 0 }),
    };

    scrollSourceCursorIntoView(editor, container);

    expect(container.scrollTop).toBe(54);
  });

  it("光标已经可见时不改变滚动位置", () => {
    const container = createContainer({ top: 0, bottom: 480 });
    container.scrollTop = 120;
    const editor = {
      getCursor: () => ({ line: 8, ch: 0 }),
      cursorCoords: () => ({ top: 100, bottom: 120, left: 0, right: 0 }),
    };

    scrollSourceCursorIntoView(editor, container);

    expect(container.scrollTop).toBe(120);
  });
});
