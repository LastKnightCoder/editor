import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardViewportProvider } from "../KeyboardViewportProvider";

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

async function flushRaf(): Promise<void> {
  await act(async () => {
    vi.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe("KeyboardViewportProvider", () => {
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
        </KeyboardViewportProvider>,
      );
    });
    await flushRaf();

    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe(
      "200px",
    );
    expect(
      document.documentElement.style.getPropertyValue("--kb-viewport-height"),
    ).toBe("600px");

    await act(async () => {
      visualViewport.setMetrics({ height: 720 });
      visualViewport.emit("resize");
    });
    await flushRaf();
    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe(
      "80px",
    );
    expect(
      document.documentElement.style.getPropertyValue("--kb-viewport-height"),
    ).toBe("720px");

    await act(async () => {
      root.unmount();
    });
    expect(document.documentElement.style.getPropertyValue("--kb-height")).toBe(
      "",
    );
    expect(
      document.documentElement.style.getPropertyValue("--kb-viewport-height"),
    ).toBe("");
  });
});
