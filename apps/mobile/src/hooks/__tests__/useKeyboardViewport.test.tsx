import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useKeyboardViewportState,
  type KeyboardViewportState,
} from "../useKeyboardViewport";

type MockVisualViewport = VisualViewport & {
  emit: (type: "resize" | "scroll") => void;
  setMetrics: (
    metrics: Partial<Pick<VisualViewport, "height" | "offsetTop" | "scale">>,
  ) => void;
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
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      if (typeof listener !== "function") {
        return;
      }
      const group = listeners.get(type) ?? new Set<EventListener>();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
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
    setMetrics: (
      metrics: Partial<Pick<VisualViewport, "height" | "offsetTop" | "scale">>,
    ) => {
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

function HookProbe(props: { onState: (state: KeyboardViewportState) => void }) {
  const state = useKeyboardViewportState();
  props.onState(state);
  return null;
}

async function flushRaf(): Promise<void> {
  await act(async () => {
    vi.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe("useKeyboardViewportState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      return window.setTimeout(() => {
        callback(performance.now());
      }, 0);
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    document.body.innerHTML = "";
  });

  it("应基于 visualViewport 计算键盘高度与视口高度", async () => {
    setWindowInnerHeight(800);
    const visualViewport = createMockVisualViewport({
      height: 500,
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
    let latestState: KeyboardViewportState | null = null;

    await act(async () => {
      root.render(
        <HookProbe
          onState={(state) => {
            latestState = state;
          }}
        />,
      );
    });
    await flushRaf();

    expect(latestState).toEqual({
      viewportHeight: 500,
      keyboardHeight: 300,
      isKeyboardVisible: true,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("缩放不为 1 时应保持已有键盘高度，避免误判", async () => {
    setWindowInnerHeight(800);
    const visualViewport = createMockVisualViewport({
      height: 520,
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
    let latestState: KeyboardViewportState | null = null;

    await act(async () => {
      root.render(
        <HookProbe
          onState={(state) => {
            latestState = state;
          }}
        />,
      );
    });
    await flushRaf();

    expect(latestState?.keyboardHeight).toBe(280);

    await act(async () => {
      visualViewport.setMetrics({ height: 700, scale: 1.2 });
      visualViewport.emit("resize");
    });
    await flushRaf();
    expect(latestState?.keyboardHeight).toBe(280);

    await act(async () => {
      visualViewport.setMetrics({ height: 700, scale: 1 });
      visualViewport.emit("resize");
    });
    await flushRaf();
    expect(latestState).toEqual({
      viewportHeight: 700,
      keyboardHeight: 100,
      isKeyboardVisible: true,
    });

    await act(async () => {
      root.unmount();
    });
  });
});
