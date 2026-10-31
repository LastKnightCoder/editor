import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapSheet, type SnapSheetState } from "../SnapSheet";

vi.mock("../KeyboardViewportProvider", () => ({
  useKeyboardViewport: () => ({ viewportHeight: 1000 }),
}));

describe("SnapSheet 手势吸附", () => {
  let root: Root;
  let host: HTMLDivElement;
  let panel: HTMLElement;
  let frameId: number;
  let eventTime: number;
  let frames: Map<number, FrameRequestCallback>;
  const onStateChange = vi.fn();

  async function flushFrames() {
    const pending = [...frames.values()];
    frames.clear();
    await act(async () => {
      for (const callback of pending) callback(performance.now());
    });
  }

  async function renderSheet({
    open = true,
    defaultState = "normal",
    normalHeight = 0.62,
  }: {
    open?: boolean;
    defaultState?: SnapSheetState;
    normalHeight?: number;
  } = {}) {
    await act(async () => {
      root.render(
        <SnapSheet
          open={open}
          defaultState={defaultState}
          normalHeight={normalHeight}
          onStateChange={onStateChange}
        >
          <SnapSheet.Handle />
          <SnapSheet.Scroll />
        </SnapSheet>
      );
    });
    const renderedPanel = host.querySelector("section");
    if (!renderedPanel) throw new Error("SnapSheet 面板未挂载");
    panel = renderedPanel;
  }

  async function touch(type: "touchstart" | "touchmove" | "touchend" | "touchcancel", y: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const ended = type === "touchend" || type === "touchcancel";
    Object.defineProperties(event, {
      touches: { value: ended ? [] : [{ identifier: 1, clientY: y }] },
      timeStamp: { value: (eventTime += 100) },
    });
    await act(async () => {
      panel.dispatchEvent(event);
    });
    return event;
  }

  function expectFull() {
    expect(panel.dataset.panState).toBe("full");
    expect(panel.style.transform).toBe("translate3d(0, 0px, 0)");
    expect(panel.style.getPropertyValue("--pan-occluded-bottom")).toBe("0px");
  }

  beforeEach(() => {
    frames = new Map();
    frameId = 0;
    eventTime = 1000;
    onStateChange.mockClear();
    vi.spyOn(performance, "now").mockReturnValue(1000);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => {
      frames.delete(id);
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it.each(["touchend", "touchcancel"] as const)(
    "最后一次移动尚未绘制就 %s 时应保持全屏吸附，并允许后续切换档位",
    async endType => {
      await renderSheet();
      await touch("touchstart", 700);
      await touch("touchmove", 640);
      await flushFrames();
      await touch("touchmove", 600);
      await touch(endType, 600);
      expectFull();

      await flushFrames();
      expectFull();
      expect(onStateChange).toHaveBeenCalledExactlyOnceWith("full", "normal");

      await touch("touchstart", 600);
      await touch("touchmove", 680);
      await touch("touchend", 680);
      await flushFrames();
      expect(panel.dataset.panState).toBe("normal");
      expect(panel.style.transform).toBe("translate3d(0, 380px, 0)");

      await touch("touchstart", 700);
      await touch("touchmove", 600);
      await touch("touchend", 600);
      await flushFrames();
      expectFull();
    }
  );

  it.each(["touchend", "touchcancel"] as const)(
    "全屏轻微下拉后 %s 时应回弹到同一档位，旧帧不得覆盖位置",
    async endType => {
      await renderSheet({ defaultState: "full" });
      expectFull();
      await touch("touchstart", 600);
      await touch("touchmove", 610);
      await flushFrames();
      expect(panel.style.transform).toBe("translate3d(0, 10px, 0)");
      await touch("touchmove", 620);
      await touch(endType, 620);
      expectFull();

      await flushFrames();
      expectFull();
      expect(onStateChange).not.toHaveBeenCalled();
    }
  );

  it("未达到位移及速度阈值时应按最新未绘制的位置选择最近档位", async () => {
    await renderSheet({ normalHeight: 0.92 });
    expect(panel.style.transform).toBe("translate3d(0, 80px, 0)");
    await touch("touchstart", 700);
    await touch("touchmove", 652);
    await touch("touchend", 652);
    await flushFrames();
    expectFull();
  });

  it("拖动中由外部关闭时应丢弃旧帧并结束手势", async () => {
    await renderSheet();
    await touch("touchstart", 700);
    await touch("touchmove", 600);
    await renderSheet({ open: false });
    expect(panel.style.transform).toBe("translate3d(0, 1000px, 0)");

    await flushFrames();
    expect(panel.style.transform).toBe("translate3d(0, 1000px, 0)");
    const move = await touch("touchmove", 550);
    await touch("touchend", 550);
    await flushFrames();
    expect(move.defaultPrevented).toBe(false);
    expect(panel.style.transform).toBe("translate3d(0, 1000px, 0)");
    expect(onStateChange).not.toHaveBeenCalled();
  });
});
