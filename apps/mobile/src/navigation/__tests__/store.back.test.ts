import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setExitApplicationForTest, useNavigationStore } from "../store";

const ORIGINAL_NAVIGATOR = {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
};

function setNavigatorForTest(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): void {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "platform", {
    value: platform,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

function restoreNavigatorForTest(): void {
  setNavigatorForTest(
    ORIGINAL_NAVIGATOR.userAgent,
    ORIGINAL_NAVIGATOR.platform,
    ORIGINAL_NAVIGATOR.maxTouchPoints,
  );
}

describe("navigation/store back", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __setExitApplicationForTest();
    const store = useNavigationStore.getState();
    store.resetNavigation();
    store.initializeHistory();
  });

  afterEach(() => {
    restoreNavigatorForTest();
  });

  it("当存在可回退页面时，dispatchBack 会优先走 history.back", () => {
    const store = useNavigationStore.getState();
    store.navigate("screen.search");

    const backSpy = vi.spyOn(window.history, "back");
    store.dispatchBack("ui");

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("根页面首次返回会提示再按一次缩小应用", () => {
    const store = useNavigationStore.getState();

    store.dispatchBack("ui");

    expect(useNavigationStore.getState().toast?.text).toBe("再按一次缩小应用");
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

  it("iOS 根页面返回应静默忽略且不触发退出实现", () => {
    setNavigatorForTest(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
      "iPhone",
      0,
    );
    const store = useNavigationStore.getState();
    const exitSpy = vi.fn(async () => undefined);
    __setExitApplicationForTest(exitSpy);

    store.dispatchBack("ui");
    store.dispatchBack("android");

    const snapshot = useNavigationStore.getState();
    expect(snapshot.toast).toBeNull();
    expect(snapshot.lastBackTs).toBe(0);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("iPadOS 运行时根页面返回应静默忽略", () => {
    setNavigatorForTest(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "MacIntel",
      5,
    );
    const store = useNavigationStore.getState();
    const exitSpy = vi.fn(async () => undefined);
    __setExitApplicationForTest(exitSpy);

    store.dispatchBack("ui");
    store.dispatchBack("ui");

    const snapshot = useNavigationStore.getState();
    expect(snapshot.toast).toBeNull();
    expect(snapshot.lastBackTs).toBe(0);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
