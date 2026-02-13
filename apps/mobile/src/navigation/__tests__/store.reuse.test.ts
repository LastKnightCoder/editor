import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNavigationStore } from "../store";

describe("navigation/store reuse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const store = useNavigationStore.getState();
    store.resetNavigation();
    store.initializeHistory();
  });

  it("single + bringToTop 页面重复打开不会重复入栈", () => {
    const store = useNavigationStore.getState();
    store.navigate("screen.search");
    const firstSearchEntry =
      useNavigationStore
        .getState()
        .screenStack.find((entry) => entry.key === "screen.search") ?? null;

    store.navigate("screen.search");
    const searchEntries = useNavigationStore
      .getState()
      .screenStack.filter((entry) => entry.key === "screen.search");

    expect(searchEntries).toHaveLength(1);
    expect(searchEntries[0].id).toBe(firstSearchEntry?.id);
  });

  it("bringToTop 会把已存在页面移动到栈顶并保留实例", () => {
    const store = useNavigationStore.getState();
    store.navigate("screen.search");
    const searchId =
      useNavigationStore
        .getState()
        .screenStack.find((entry) => entry.key === "screen.search")?.id ?? "";

    store.navigate("screen.about");
    store.navigate("screen.search");

    const state = useNavigationStore.getState();
    expect(state.screenStack[state.screenStack.length - 1].key).toBe(
      "screen.search",
    );
    expect(state.screenStack[state.screenStack.length - 1].id).toBe(searchId);
  });

  it("卡片预览 overlay 使用 replace 策略，仅保留一个实例", () => {
    const store = useNavigationStore.getState();
    store.openOverlay("overlay.cardPreview", { cardId: 10 });
    const firstPreviewId =
      useNavigationStore.getState().overlayStack[
        useNavigationStore.getState().overlayStack.length - 1
      ]?.id ?? "";

    store.openOverlay("overlay.cardPreview", { cardId: 11 });

    const overlayStack = useNavigationStore.getState().overlayStack;
    expect(overlayStack).toHaveLength(1);
    expect(overlayStack[0].params.cardId).toBe(11);
    expect(overlayStack[0].id).not.toBe(firstPreviewId);
  });

  it("快速闪念 overlay 使用 single + replace，重复打开仅保留一个实例", () => {
    const store = useNavigationStore.getState();
    store.openOverlay("overlay.quickCapture", {});
    const firstQuickCaptureId =
      useNavigationStore.getState().overlayStack[
        useNavigationStore.getState().overlayStack.length - 1
      ]?.id ?? "";

    store.openOverlay("overlay.quickCapture", {});

    const quickCaptureEntries = useNavigationStore
      .getState()
      .overlayStack.filter((entry) => entry.key === "overlay.quickCapture");
    expect(quickCaptureEntries).toHaveLength(1);
    expect(quickCaptureEntries[0].id).toBe(firstQuickCaptureId);
  });

  it("侧边栏 overlay 为 single + push，重复打开不会叠加", () => {
    const store = useNavigationStore.getState();
    store.openOverlay("overlay.sidebar", {});
    store.openOverlay("overlay.sidebar", {});

    const sidebarEntries = useNavigationStore
      .getState()
      .overlayStack.filter((entry) => entry.key === "overlay.sidebar");

    expect(sidebarEntries).toHaveLength(1);
  });

  it("screen.contentDetail 为 multi + push，可重复入栈", () => {
    const store = useNavigationStore.getState();
    store.navigate("screen.contentDetail", { contentId: 101 });
    store.navigate("screen.contentDetail", { contentId: 102 });

    const detailEntries = useNavigationStore
      .getState()
      .screenStack.filter((entry) => entry.key === "screen.contentDetail");
    expect(detailEntries).toHaveLength(2);
    expect(detailEntries[0].params.contentId).toBe(101);
    expect(detailEntries[1].params.contentId).toBe(102);
  });

  it("navigate 支持 dismissOverlays 原子关闭 overlay 并进入 screen", () => {
    const store = useNavigationStore.getState();
    store.openOverlay("overlay.cardPreview", {
      cardId: 10,
      ui: { scrollTop: 12, panelState: "normal" },
    });
    const pushSpy = vi.spyOn(window.history, "pushState");

    store.navigate(
      "screen.contentDetail",
      { contentId: 9001 },
      { dismissOverlays: ["overlay.cardPreview"] },
    );

    const state = useNavigationStore.getState();
    expect(state.overlayStack).toHaveLength(0);
    expect(state.screenStack[state.screenStack.length - 1].key).toBe(
      "screen.contentDetail",
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it("replaceOverlayParams 使用 replaceHistorySnapshot 更新 overlay 参数", () => {
    const store = useNavigationStore.getState();
    store.openOverlay("overlay.cardPreview", {
      cardId: 33,
      ui: { scrollTop: 0, panelState: "normal" },
    });
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    store.replaceOverlayParams("overlay.cardPreview", {
      ui: { scrollTop: 123, panelState: "full" },
    });

    const params = useNavigationStore.getState().overlayStack[0]?.params;
    expect(params?.cardId).toBe(33);
    expect(params.ui?.scrollTop).toBe(123);
    expect(params.ui?.panelState).toBe("full");
    expect(pushSpy).toHaveBeenCalledTimes(0);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });
});
