// 边缘返回手势的让位规则：data-no-edge-back 标记区域（编辑器块把手等自带拖拽的控件）起手不跟手；
// 栈顶页有必定消费返回的页内层（isBlocked）时不跟手。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useEdgeBackGesture,
  type EdgeBackGestureConfig,
  type GestureAnimationControls,
} from "../gesture";

// jsdom 的 TouchEvent 构造器不可靠：用通用 Event 补上手势读取的触点属性
function dispatchTouch(
  target: Element,
  phase: "touchstart" | "touchmove" | "touchend",
  x: number,
  y: number
): void {
  const event = new Event(phase, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperty(event, "touches", { value: phase === "touchend" ? [] : [point] });
  Object.defineProperty(event, "changedTouches", { value: [point] });
  target.dispatchEvent(event);
}

function makeControls() {
  return { set: vi.fn(), start: vi.fn(() => Promise.resolve()) };
}

describe("useEdgeBackGesture", () => {
  let host: HTMLDivElement;
  let root: Root;
  let active: ReturnType<typeof makeControls>;
  let onBack: ReturnType<typeof vi.fn>;
  let blocked: boolean;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    active = makeControls();
    onBack = vi.fn(() => true);
    blocked = false;
    const config: EdgeBackGestureConfig = {
      enabled: true,
      activeEntryId: "top",
      underlayEntryId: null,
      controlsMap: new Map([["top", active as unknown as GestureAnimationControls]]),
      isBlocked: () => blocked,
      onBack,
    };
    function Probe() {
      useEdgeBackGesture(config);
      return (
        <div>
          <button data-no-edge-back="true" id="handle">
            <span id="handle-icon" />
          </button>
          <p id="body">正文</p>
        </div>
      );
    }
    act(() => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("普通区域从左缘起手：跟手位移", () => {
    const body = document.getElementById("body")!;
    dispatchTouch(body, "touchstart", 10, 300);
    dispatchTouch(body, "touchmove", 60, 302);
    expect(active.set).toHaveBeenCalled();
  });

  it("标记区域（含其子元素）起手：不跟手、不返回", () => {
    const icon = document.getElementById("handle-icon")!;
    dispatchTouch(icon, "touchstart", 10, 300);
    dispatchTouch(icon, "touchmove", 200, 302);
    dispatchTouch(icon, "touchend", 200, 302);
    expect(active.set).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("栈顶页有页内层挡住时：不跟手、不返回", () => {
    blocked = true;
    const body = document.getElementById("body")!;
    dispatchTouch(body, "touchstart", 10, 300);
    dispatchTouch(body, "touchmove", 200, 302);
    dispatchTouch(body, "touchend", 200, 302);
    expect(active.set).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});
