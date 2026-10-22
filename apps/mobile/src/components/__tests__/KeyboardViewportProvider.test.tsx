import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEYBOARD_RESERVE_RELEASE_TIMEOUT_MS,
  KeyboardViewportProvider,
  resolvePanelHeight,
  useKeyboardReservation,
  useKeyboardViewport,
  type KeyboardReservation,
  type ReservedKeyboardViewportState,
} from "../KeyboardViewportProvider";

type MockVisualViewport = VisualViewport & {
  emit: (type: "resize" | "scroll") => void;
  setMetrics: (metrics: Partial<Pick<VisualViewport, "height" | "offsetTop" | "scale">>) => void;
};

function setWindowInnerHeight(value: number): void {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value,
  });
}

function createMockVisualViewport(params: {
  height: number;
  offsetTop: number;
  scale: number;
}): MockVisualViewport {
  const listeners = new Map<string, Set<EventListener>>();
  const viewport = {
    height: params.height,
    offsetTop: params.offsetTop,
    scale: params.scale,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener !== "function") {
        return;
      }
      const group = listeners.get(type) ?? new Set<EventListener>();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener !== "function") {
        return;
      }
      listeners.get(type)?.delete(listener);
    },
    emit: (type: "resize" | "scroll") => {
      const event = new Event(type);
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    setMetrics: (metrics: Partial<Pick<VisualViewport, "height" | "offsetTop" | "scale">>) => {
      if (typeof metrics.height === "number") {
        viewport.height = metrics.height;
      }
      if (typeof metrics.offsetTop === "number") {
        viewport.offsetTop = metrics.offsetTop;
      }
      if (typeof metrics.scale === "number") {
        viewport.scale = metrics.scale;
      }
    },
  };
  return viewport as MockVisualViewport;
}

function focusEditableInput(): HTMLInputElement {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  return input;
}

async function flushRaf(): Promise<void> {
  await act(async () => {
    vi.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe("KeyboardViewportProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "scrollBy", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      return window.setTimeout(() => {
        callback(performance.now());
      }, 0);
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.documentElement.style.removeProperty("--kb-height");
    document.documentElement.style.removeProperty("--kb-viewport-height");
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    document.body.innerHTML = "";
  });

  it("应写入并更新键盘相关 CSS 变量，卸载后清理", async () => {
    setWindowInnerHeight(800);
    const visualViewport = createMockVisualViewport({
      height: 600,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(
        <KeyboardViewportProvider>
          <div>keyboard-provider</div>
        </KeyboardViewportProvider>
      );
    });
    await flushRaf();

    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe("200px");
    expect(document.documentElement.style.getPropertyValue("--kb-viewport-height")).toBe("600px");

    await act(async () => {
      visualViewport.setMetrics({ height: 720 });
      visualViewport.emit("resize");
    });
    await flushRaf();
    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe("80px");
    expect(document.documentElement.style.getPropertyValue("--kb-viewport-height")).toBe("720px");

    await act(async () => {
      root.unmount();
    });
    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--kb-viewport-height")).toBe("");
  });

  it("layout 与 visualViewport 同步收缩且存在焦点时应写入非零键盘高度", async () => {
    setWindowInnerHeight(800);
    const visualViewport = createMockVisualViewport({
      height: 800,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(
        <KeyboardViewportProvider>
          <div>keyboard-provider</div>
        </KeyboardViewportProvider>
      );
    });
    await flushRaf();
    await act(async () => {
      focusEditableInput();
      setWindowInnerHeight(500);
      visualViewport.setMetrics({ height: 500, offsetTop: 0 });
      visualViewport.emit("resize");
    });
    await flushRaf();

    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe("300px");
    expect(document.documentElement.style.getPropertyValue("--kb-viewport-height")).toBe("500px");

    await act(async () => {
      root.unmount();
    });
  });

  describe("底部预留", () => {
    type Probe = {
      state: ReservedKeyboardViewportState;
      reservation: KeyboardReservation;
    };

    function ProbeConsumer(props: { probe: Probe }) {
      props.probe.state = useKeyboardViewport();
      props.probe.reservation = useKeyboardReservation();
      return null;
    }

    async function renderProbe(viewportHeight: number) {
      setWindowInnerHeight(800);
      const visualViewport = createMockVisualViewport({
        height: viewportHeight,
        offsetTop: 0,
        scale: 1,
      });
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: visualViewport,
      });
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root: Root = createRoot(host);
      const probe = {} as Probe;
      await act(async () => {
        root.render(
          <KeyboardViewportProvider>
            <ProbeConsumer probe={probe} />
          </KeyboardViewportProvider>
        );
      });
      await flushRaf();
      const setKeyboard = async (keyboardHeight: number) => {
        await act(async () => {
          visualViewport.setMetrics({ height: 800 - keyboardHeight });
          visualViewport.emit("resize");
        });
        // 只推进一帧，避免提前触发预留释放的超时定时器
        await act(async () => {
          vi.advanceTimersByTime(1);
          await Promise.resolve();
        });
      };
      return { probe, root, setKeyboard };
    }

    function readCssVar(name: string): string {
      return document.documentElement.style.getPropertyValue(name);
    }

    it("有效高度取键盘与预留的大者，CSS 变量写入有效值", async () => {
      const { probe, root, setKeyboard } = await renderProbe(600);
      const firstReservation = probe.reservation;

      await act(async () => {
        probe.reservation.reserve(300.4);
      });
      expect(probe.state).toMatchObject({
        keyboardHeight: 300,
        viewportHeight: 500,
        rawKeyboardHeight: 200,
        reservedHeight: 300,
        isKeyboardVisible: true,
      });
      expect(readCssVar("--kb-height")).toBe("300px");
      expect(readCssVar("--kb-viewport-height")).toBe("500px");

      await setKeyboard(0);
      expect(probe.state).toMatchObject({
        keyboardHeight: 300,
        viewportHeight: 500,
        rawKeyboardHeight: 0,
        isKeyboardVisible: false,
      });
      expect(probe.reservation).toBe(firstReservation);

      await act(async () => {
        probe.reservation.releaseNow();
      });
      expect(probe.state.keyboardHeight).toBe(0);
      expect(readCssVar("--kb-height")).toBe("0px");
      expect(readCssVar("--kb-viewport-height")).toBe("800px");

      await act(async () => {
        root.unmount();
      });
    });

    it("键盘升到预留的 0.9 倍时释放预留", async () => {
      const { probe, root, setKeyboard } = await renderProbe(800);
      await act(async () => {
        probe.reservation.reserve(300);
        probe.reservation.releaseWhenKeyboardShown();
      });
      await setKeyboard(200);
      expect(probe.state.reservedHeight).toBe(300);
      await setKeyboard(270);
      expect(probe.state.reservedHeight).toBe(0);
      expect(probe.state.keyboardHeight).toBe(270);
      await act(async () => {
        root.unmount();
      });
    });

    it("键盘未升起时超时释放预留", async () => {
      const { probe, root } = await renderProbe(800);
      await act(async () => {
        probe.reservation.reserve(300);
        probe.reservation.releaseWhenKeyboardShown();
      });
      await act(async () => {
        vi.advanceTimersByTime(KEYBOARD_RESERVE_RELEASE_TIMEOUT_MS - 1);
      });
      expect(probe.state.reservedHeight).toBe(300);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(probe.state.reservedHeight).toBe(0);
      await act(async () => {
        root.unmount();
      });
    });

    it("reserve 取消待执行的释放", async () => {
      const { probe, root, setKeyboard } = await renderProbe(800);
      await act(async () => {
        probe.reservation.reserve(300);
        probe.reservation.releaseWhenKeyboardShown();
      });
      await act(async () => {
        probe.reservation.reserve(320);
      });
      await act(async () => {
        vi.advanceTimersByTime(KEYBOARD_RESERVE_RELEASE_TIMEOUT_MS * 2);
      });
      await setKeyboard(310);
      expect(probe.state.reservedHeight).toBe(320);
      await act(async () => {
        root.unmount();
      });
    });

    it("记录每轮键盘峰值，新一轮出现新峰值后才覆盖", async () => {
      const { probe, root, setKeyboard } = await renderProbe(800);
      expect(probe.state.lastKeyboardHeight).toBe(0);
      await setKeyboard(150);
      await setKeyboard(300);
      await setKeyboard(120);
      expect(probe.state.lastKeyboardHeight).toBe(300);
      await setKeyboard(0);
      expect(probe.state.lastKeyboardHeight).toBe(300);
      await setKeyboard(260);
      expect(probe.state.lastKeyboardHeight).toBe(260);
      // 不足 100px 的峰值（只有候选条）不覆盖真实键盘高度
      await setKeyboard(0);
      await setKeyboard(60);
      expect(probe.state.lastKeyboardHeight).toBe(260);
      await act(async () => {
        root.unmount();
      });
    });

    it("resolvePanelHeight 优先用最近键盘高度，否则取视口 38%", async () => {
      const { probe, root, setKeyboard } = await renderProbe(800);
      expect(resolvePanelHeight(probe.state)).toBe(Math.round(800 * 0.38));
      await setKeyboard(80);
      expect(resolvePanelHeight(probe.state)).toBe(Math.round(800 * 0.38));
      await setKeyboard(0);
      await setKeyboard(280);
      expect(resolvePanelHeight(probe.state)).toBe(280);
      await act(async () => {
        root.unmount();
      });
    });
  });
});
