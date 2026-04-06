import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initSelectionManager, type SelectionInfo } from "../selection-manager";

type MockSelectionState = {
  text: string;
  range: Range;
  isCollapsed?: boolean;
  rangeCount?: number;
};

const createRect = (overrides: Partial<DOMRect> = {}) =>
  ({
    left: 100,
    top: 120,
    right: 220,
    bottom: 140,
    width: 120,
    height: 20,
    x: 100,
    y: 120,
    toJSON: () => ({}),
    ...overrides,
  }) as DOMRect;

const createRange = (rect: DOMRect) =>
  ({
    getBoundingClientRect: () => rect,
    cloneRange: () => createRange(rect),
  }) as unknown as Range;

const createSelection = (state: MockSelectionState | null) =>
  state
    ? ({
        isCollapsed: state.isCollapsed ?? false,
        rangeCount: state.rangeCount ?? 1,
        toString: () => state.text,
        getRangeAt: () => state.range,
      } as unknown as Selection)
    : ({
        isCollapsed: true,
        rangeCount: 0,
        toString: () => "",
        getRangeAt: () => {
          throw new Error("no range");
        },
      } as unknown as Selection);

const flushSelectionWork = async () => {
  await vi.runAllTimersAsync();
};

describe("selection-manager", () => {
  let selectionSpy: ReturnType<typeof vi.fn>;
  let highlightSpy: ReturnType<typeof vi.fn>;
  let cleanup: (() => void) | null;
  let shadowHost: HTMLDivElement;
  let shadowRoot: ShadowRoot;
  let currentSelection: Selection;

  beforeEach(() => {
    vi.useFakeTimers();

    selectionSpy = vi.fn();
    highlightSpy = vi.fn();
    cleanup = null;

    shadowHost = document.createElement("div");
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: "open" });

    currentSelection = createSelection(null);
    vi.spyOn(window, "getSelection").mockImplementation(() => currentSelection);

    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) =>
      window.setTimeout(
        () => callback(performance.now()),
        16,
      )) as typeof requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", ((id: number) =>
      window.clearTimeout(id)) as typeof cancelAnimationFrame);

    cleanup = initSelectionManager(selectionSpy, highlightSpy, shadowRoot);
  });

  afterEach(() => {
    cleanup?.();
    shadowHost.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("selectionchange 在非按压状态下会同步稳定选区", async () => {
    const rect = createRect();
    currentSelection = createSelection({
      text: "tau selection",
      range: createRange(rect),
    });

    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    await flushSelectionWork();

    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(selectionSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "tau selection",
        rect,
      }),
    );
  });

  it("按压中的 selectionchange 会等待 pointerup 后再发出", async () => {
    currentSelection = createSelection({
      text: "dragging text",
      range: createRange(createRect()),
    });

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    await flushSelectionWork();

    expect(selectionSpy).not.toHaveBeenCalled();

    document.body.dispatchEvent(new Event("pointerup", { bubbles: true }));
    await flushSelectionWork();

    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(selectionSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "dragging text" }),
    );
  });

  it("pointerup 后紧跟 mouseup 不会重复触发", async () => {
    currentSelection = createSelection({
      text: "trackpad selection",
      range: createRange(createRect()),
    });

    document.body.dispatchEvent(new Event("pointerup", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await flushSelectionWork();

    expect(selectionSpy).toHaveBeenCalledTimes(1);
  });

  it("空选区清理只发出一次 null", async () => {
    currentSelection = createSelection({
      text: "first selection",
      range: createRange(createRect()),
    });
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    await flushSelectionWork();

    currentSelection = createSelection(null);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    await flushSelectionWork();

    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    await flushSelectionWork();

    expect(selectionSpy).toHaveBeenCalledTimes(2);
    expect(selectionSpy.mock.calls[1]?.[0]).toBeNull();
  });

  it("无效矩形不会触发选区回调", async () => {
    currentSelection = createSelection({
      text: "invisible selection",
      range: createRange(
        createRect({ width: 0, height: 0, right: 0, bottom: 0 }),
      ),
    });

    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    await flushSelectionWork();

    expect(selectionSpy).not.toHaveBeenCalled();
  });

  it("Shadow UI 内的点击不会触发外部 dismiss", async () => {
    const button = document.createElement("button");
    shadowRoot.appendChild(button);

    const event = new MouseEvent("mousedown", {
      bubbles: true,
      composed: true,
    });
    Object.defineProperty(event, "composedPath", {
      value: () => [button, shadowRoot, shadowHost, document.body, document],
    });

    button.dispatchEvent(event);
    await flushSelectionWork();

    expect(highlightSpy).not.toHaveBeenCalled();
  });

  it("点击已有高亮时触发高亮编辑回调", async () => {
    const mark = document.createElement("mark");
    mark.setAttribute("data-tau-highlight-id", "highlight-1");
    Object.defineProperty(mark, "getBoundingClientRect", {
      value: () => createRect({ left: 32, top: 48 }),
    });
    document.body.appendChild(mark);

    mark.dispatchEvent(new Event("pointerup", { bubbles: true }));
    await flushSelectionWork();

    expect(highlightSpy).toHaveBeenCalledTimes(1);
    expect(highlightSpy).toHaveBeenCalledWith(
      "highlight-1",
      expect.objectContaining({ left: 32, top: 48 }),
    );
  });
});
