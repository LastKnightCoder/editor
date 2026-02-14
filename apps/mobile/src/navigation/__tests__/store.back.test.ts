import { beforeEach, describe, expect, it, vi } from "vitest";
import { __setExitApplicationForTest, useNavigationStore } from "../store";

describe("navigation/store back", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __setExitApplicationForTest();
    const store = useNavigationStore.getState();
    store.resetNavigation();
    store.initializeHistory();
  });

  it("当存在可回退页面时，dispatchBack 会优先走 history.back", () => {
    const store = useNavigationStore.getState();
    store.navigate("screen.search");

    const backSpy = vi.spyOn(window.history, "back");
    store.dispatchBack("ui");

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("根页面首次返回会提示再按一次退出", () => {
    const store = useNavigationStore.getState();

    store.dispatchBack("ui");

    expect(useNavigationStore.getState().toast?.text).toBe("再按一次退出应用");
  });

  it("根页面两次返回会清理提示并尝试退出", () => {
    const store = useNavigationStore.getState();
    const exitSpy = vi.fn(async () => undefined);
    __setExitApplicationForTest(exitSpy);

    store.dispatchBack("ui");
    store.dispatchBack("ui");

    const snapshot = useNavigationStore.getState();
    expect(snapshot.toast).toBeNull();
    expect(snapshot.lastBackTs).toBeGreaterThan(0);
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });
});
