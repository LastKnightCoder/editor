import { beforeEach, describe, expect, it } from "vitest";
import { useNavigationStore } from "../store";

describe("navigation/store reuse", () => {
  beforeEach(() => {
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

  it("侧边栏 overlay 为 single + push，重复打开不会叠加", () => {
    const store = useNavigationStore.getState();
    store.openOverlay("overlay.sidebar", {});
    store.openOverlay("overlay.sidebar", {});

    const sidebarEntries = useNavigationStore
      .getState()
      .overlayStack.filter((entry) => entry.key === "overlay.sidebar");

    expect(sidebarEntries).toHaveLength(1);
  });
});
