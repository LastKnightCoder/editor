import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardViewportProvider } from "../KeyboardViewportProvider";
import { PanContainer } from "../PanContainer";

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

describe("PanContainer keyboard viewport", () => {
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

  it("键盘弹起导致视口变化时应重新计算面板位移", async () => {
    setWindowInnerHeight(1000);
    const visualViewport = createMockVisualViewport({
      height: 1000,
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
          <PanContainer
            open
            initialState="normal"
            enabledStates={["normal", "full"]}
            heights={{ normal: 0.5 }}
          >
            <div>sheet-content</div>
          </PanContainer>
        </KeyboardViewportProvider>,
      );
    });
    await flushRaf();

    let panel = document.querySelector("section");
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("style")).toContain("translate3d(0, 500px, 0)");
    expect(panel?.getAttribute("style")).toContain(
      "--pan-occluded-bottom: 500px",
    );

    await act(async () => {
      visualViewport.setMetrics({ height: 700 });
      visualViewport.emit("resize");
    });
    await flushRaf();

    panel = document.querySelector("section");
    expect(panel?.getAttribute("style")).toContain("translate3d(0, 350px, 0)");
    expect(panel?.getAttribute("style")).toContain(
      "--pan-occluded-bottom: 350px",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("在可编辑元素上按下时不应触发面板拖拽", async () => {
    setWindowInnerHeight(1000);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(
        <KeyboardViewportProvider>
          <PanContainer
            open
            initialState="normal"
            enabledStates={["normal", "full"]}
            heights={{ normal: 0.5 }}
          >
            <div>
              <div contentEditable suppressContentEditableWarning>
                editor
              </div>
            </div>
          </PanContainer>
        </KeyboardViewportProvider>,
      );
    });
    await flushRaf();

    const panel = document.querySelector("section") as HTMLElement | null;
    const editable = document.querySelector(
      '[contenteditable="true"]',
    ) as HTMLElement | null;
    expect(panel).toBeTruthy();
    expect(editable).toBeTruthy();
    if (!panel || !editable) {
      return;
    }

    const beforeTransform = panel.style.transform;

    await act(async () => {
      editable.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientY: 700,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientY: 540,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
        }),
      );
    });

    expect(panel.style.transform).toBe(beforeTransform);

    await act(async () => {
      root.unmount();
    });
  });

  it("full 状态应暴露 0px 的底部遮挡变量", async () => {
    setWindowInnerHeight(1000);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(
        <KeyboardViewportProvider>
          <PanContainer
            open
            initialState="full"
            enabledStates={["normal", "full"]}
            heights={{ normal: 0.5 }}
          >
            <div>sheet-content</div>
          </PanContainer>
        </KeyboardViewportProvider>,
      );
    });
    await flushRaf();

    const panel = document.querySelector("section");
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("style")).toContain("translate3d(0, 0px, 0)");
    expect(panel?.getAttribute("style")).toContain(
      "--pan-occluded-bottom: 0px",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
