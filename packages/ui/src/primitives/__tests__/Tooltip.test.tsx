import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "../Tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Tooltip 条件禁用", () => {
  let root: Root;
  let container: HTMLDivElement;
  let clock = Date.now();

  beforeEach(() => {
    vi.useFakeTimers();
    clock += 10_000;
    vi.setSystemTime(clock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function render(disabled: boolean, open?: boolean, onOpenChange?: (open: boolean) => void) {
    act(() =>
      root.render(
        <Tooltip
          content="完整标题"
          delay={1000}
          disabled={disabled}
          open={open}
          onOpenChange={onOpenChange}
        >
          <button type="button">标题</button>
        </Tooltip>
      )
    );
  }

  function pointer(type: "pointerover" | "pointerout") {
    act(() => {
      container
        .querySelector("button")!
        .dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: document.body }));
    });
  }

  function advance(ms: number) {
    act(() => vi.advanceTimersByTime(ms));
  }

  function expectOpen(open: boolean) {
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.hasAttribute("inert")).toBe(!open);
    expect(container.querySelector("button")!.getAttribute("aria-describedby")).toBe(
      open ? tooltip.id : null
    );
  }

  it("已显示的提示禁用后清空状态，重新启用须再次悬停", () => {
    render(false);
    pointer("pointerover");
    advance(1000);
    expectOpen(true);

    render(true);
    expectOpen(false);
    pointer("pointerout");
    render(false);
    advance(1000);
    expectOpen(false);

    pointer("pointerover");
    advance(1000);
    expectOpen(true);
  });

  it("禁用取消待执行的显示延迟，重新启用不恢复旧任务", () => {
    const changed = vi.fn();
    render(false, undefined, changed);
    pointer("pointerover");
    advance(500);
    render(true, undefined, changed);
    advance(1000);
    expect(changed).not.toHaveBeenCalled();
    render(false, undefined, changed);
    expectOpen(false);
    advance(1000);
    expectOpen(false);
  });

  it("禁用期间悬停和键盘聚焦不会排队显示，也不禁用触发器", () => {
    const changed = vi.fn();
    render(true, undefined, changed);
    pointer("pointerover");
    const button = container.querySelector("button")!;
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    advance(1000);
    expectOpen(false);
    expect(changed).not.toHaveBeenCalled();
    render(false, undefined, changed);
    expectOpen(false);
  });

  it("禁用覆盖受控显示，重新启用继续遵循外部 open", () => {
    const changed = vi.fn();
    render(false, true, changed);
    expectOpen(true);
    render(true, true, changed);
    expectOpen(false);
    render(false, true, changed);
    expectOpen(true);
    expect(changed).not.toHaveBeenCalled();
  });

  it("className 经 cn 合并，可覆盖默认层级", () => {
    act(() =>
      root.render(
        <Tooltip content="提示" className="z-[10200]">
          <button type="button">触发</button>
        </Tooltip>
      )
    );
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.className).toContain("z-[10200]");
    expect(tooltip.className).not.toContain("z-[300]");
  });
});
