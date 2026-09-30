import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgressBar, { TOOLTIP_HOVER_DELAY_MS } from "../ProgressBar";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const mount = async (node: React.ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  return container.firstElementChild as HTMLElement;
};

/** jsdom 没有 PointerEvent 构造器，用 MouseEvent 充当（React 按事件类型分发） */
const pointer = async (target: HTMLElement, type: string, init: MouseEventInit = {}) => {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("ProgressBar 悬停气泡", () => {
  const renderTooltip = () => <span data-testid="tip">tip</span>;

  it("路过不出气泡，停留足够久才出现并开始上报位置", async () => {
    const onPointerValue = vi.fn();
    const bar = await mount(
      <ProgressBar
        value={0.3}
        onCommit={vi.fn()}
        onPointerValue={onPointerValue}
        renderTooltip={renderTooltip}
      />
    );

    await pointer(bar, "pointerover");
    await pointer(bar, "pointermove");
    await act(async () => {
      vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS - 50);
    });
    expect(bar.querySelector("[data-testid=tip]")).toBeNull();
    expect(onPointerValue).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(bar.querySelector("[data-testid=tip]")).not.toBeNull();
    expect(onPointerValue).toHaveBeenCalled();
  });

  it("停留未满就离开，不会再出气泡", async () => {
    const bar = await mount(
      <ProgressBar value={0.3} onCommit={vi.fn()} renderTooltip={renderTooltip} />
    );
    await pointer(bar, "pointerover");
    await pointer(bar, "pointerout", { relatedTarget: document.body });
    await act(async () => {
      vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS * 2);
    });
    expect(bar.querySelector("[data-testid=tip]")).toBeNull();
  });

  it("按下拖动时立即显示气泡", async () => {
    const bar = await mount(
      <ProgressBar value={0.3} onCommit={vi.fn()} renderTooltip={renderTooltip} />
    );
    bar.setPointerCapture = vi.fn();
    await pointer(bar, "pointerdown");
    expect(bar.querySelector("[data-testid=tip]")).not.toBeNull();
  });
});
