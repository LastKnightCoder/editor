// tab 滑动手势与 tab 顺序契约的单元测试：
// - resolveTabNeighbor 的顺序/边界语义
// - useTabSwipeGesture 的方向锁、投影进度、阈值提交、让位规则（边缘返回/排除标记/
//   横向滚动容器）、手势忙期间（enabled=false）的触摸拒绝

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabSwipeGesture, type TabSwipeGestureConfig } from "../tabSwipeGesture";
import { setTabSwipeOrigin, useTabSwipeOrigin } from "../tabSwipeOrigin";
import { TAB_ORDER, isTabRoot, resolveTabNeighbor } from "../tabs";

// 手势按 performance.now 估计速度：测试用可控时钟，每个触点默认间隔一帧
let clock = 0;

// jsdom 的 TouchEvent 构造器不可靠：用通用 Event 补上手势读取的触点属性
function dispatchTouch(
  target: Element,
  phase: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  x: number,
  y: number,
  advanceMs = 16
): void {
  clock += advanceMs;
  const event = new Event(phase, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperty(event, "touches", { value: [point] });
  Object.defineProperty(event, "changedTouches", { value: [point] });
  target.dispatchEvent(event);
}

function makeConfig(overrides: Partial<TabSwipeGestureConfig> = {}): TabSwipeGestureConfig {
  return {
    enabled: true,
    activeTabKey: "home",
    edgeBackEnabled: false,
    onEngage: vi.fn(),
    onMove: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("resolveTabNeighbor", () => {
  it("按 TAB_ORDER 返回相邻 tab", () => {
    expect(TAB_ORDER).toEqual(["home", "cardsLibrary", "diaryHome", "settings"]);
    expect(resolveTabNeighbor("home", 1)).toBe("cardsLibrary");
    expect(resolveTabNeighbor("cardsLibrary", 1)).toBe("diaryHome");
    expect(resolveTabNeighbor("diaryHome", 1)).toBe("settings");
    expect(resolveTabNeighbor("settings", -1)).toBe("diaryHome");
    expect(resolveTabNeighbor("cardsLibrary", -1)).toBe("home");
  });

  it("边界 tab 与未知 key 无邻居", () => {
    expect(resolveTabNeighbor("home", -1)).toBeNull();
    expect(resolveTabNeighbor("settings", 1)).toBeNull();
    expect(resolveTabNeighbor("unknown", 1)).toBeNull();
    expect(isTabRoot("home")).toBe(true);
    expect(isTabRoot("unknown")).toBe(false);
  });
});

describe("tabSwipeOrigin（Dock 高亮的手势期覆盖信号）", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let rendered: { origin: string | null } | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rendered = { origin: "unset" };
    function Probe() {
      rendered!.origin = useTabSwipeOrigin();
      return <div />;
    }
    act(() => {
      root!.render(<Probe />);
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    act(() => {
      setTabSwipeOrigin(null);
    });
  });

  it("跟随手势生命周期：engage 设 origin，清手势复位 null", () => {
    expect(rendered!.origin).toBeNull();
    act(() => {
      setTabSwipeOrigin("home");
    });
    expect(rendered!.origin).toBe("home");
    act(() => {
      setTabSwipeOrigin("home");
    });
    expect(rendered!.origin).toBe("home");
    act(() => {
      setTabSwipeOrigin(null);
    });
    expect(rendered!.origin).toBeNull();
  });
});

describe("useTabSwipeGesture", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    vi.restoreAllMocks();
  });

  function renderProbe(config: TabSwipeGestureConfig): void {
    function Probe() {
      useTabSwipeGesture(config);
      return <div />;
    }
    act(() => {
      root!.render(<Probe />);
    });
  }

  it("从右向左滑到阈值：engage 下一个 tab 并 commit", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 200, 302);
    expect(config.onEngage).toHaveBeenCalledWith("cardsLibrary", 1);
    dispatchTouch(document.body, "touchend", 150, 302);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
    expect(config.onCancel).not.toHaveBeenCalled();
  });

  it("从左向右滑：engage 上一个 tab（方向 -1）", () => {
    const config = makeConfig({ activeTabKey: "cardsLibrary" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 100, 300);
    dispatchTouch(document.body, "touchmove", 200, 302);
    expect(config.onEngage).toHaveBeenCalledWith("home", -1);
    dispatchTouch(document.body, "touchend", 250, 302);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
  });

  it("位移不足且无速度：cancel 回弹", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 260, 301);
    expect(config.onEngage).toHaveBeenCalledTimes(1);
    dispatchTouch(document.body, "touchend", 290, 301);
    expect(config.onCancel).toHaveBeenCalledTimes(1);
    expect(config.onCommit).not.toHaveBeenCalled();
  });

  it("真机快扫（松手坐标同最后一次 move）：短距离即 commit", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 285, 301);
    dispatchTouch(document.body, "touchmove", 260, 301);
    dispatchTouch(document.body, "touchend", 260, 301, 0);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
    expect(config.onCancel).not.toHaveBeenCalled();
  });

  it("快扫距离不足 24px：cancel", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 285, 301);
    dispatchTouch(document.body, "touchend", 285, 301, 0);
    expect(config.onCancel).toHaveBeenCalledTimes(1);
    expect(config.onCommit).not.toHaveBeenCalled();
  });

  it("拖一段后停顿再松手：速度归零，未过半屏 cancel", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 250, 301);
    dispatchTouch(document.body, "touchmove", 200, 301);
    dispatchTouch(document.body, "touchend", 200, 301, 150);
    expect(config.onCancel).toHaveBeenCalledTimes(1);
    expect(config.onCommit).not.toHaveBeenCalled();
  });

  it("慢拖过半屏停住松手：commit", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 200, 301);
    dispatchTouch(document.body, "touchmove", 100, 301);
    dispatchTouch(document.body, "touchend", 100, 301, 150);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
  });

  it("拖过半屏后反向快扫：cancel", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 200, 301);
    dispatchTouch(document.body, "touchmove", 80, 301, 200);
    dispatchTouch(document.body, "touchmove", 100, 301);
    dispatchTouch(document.body, "touchmove", 110, 301);
    dispatchTouch(document.body, "touchend", 110, 301, 0);
    expect(config.onCancel).toHaveBeenCalledTimes(1);
    expect(config.onCommit).not.toHaveBeenCalled();
  });

  it("纵向意图不锁定，不触发任何回调", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 305, 400);
    dispatchTouch(document.body, "touchend", 306, 450);
    expect(config.onEngage).not.toHaveBeenCalled();
    expect(config.onCommit).not.toHaveBeenCalled();
    expect(config.onCancel).not.toHaveBeenCalled();
  });

  it("边界 tab 反向滑（home 右滑）：放弃跟踪", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 100, 300);
    dispatchTouch(document.body, "touchmove", 250, 302);
    dispatchTouch(document.body, "touchend", 350, 302);
    expect(config.onEngage).not.toHaveBeenCalled();
    expect(config.onCancel).not.toHaveBeenCalled();
  });

  it("反向拖回起点松手：cancel", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 200, 300);
    dispatchTouch(document.body, "touchmove", 100, 301); // 锁定 next
    dispatchTouch(document.body, "touchend", 200, 301); // 拖回起点
    expect(config.onEngage).toHaveBeenCalledTimes(1);
    expect(config.onCancel).toHaveBeenCalledTimes(1);
  });

  it("左边缘让位给返回手势", () => {
    const config = makeConfig({ activeTabKey: "cardsLibrary", edgeBackEnabled: true });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 20, 300);
    dispatchTouch(document.body, "touchmove", 150, 302);
    dispatchTouch(document.body, "touchend", 250, 302);
    expect(config.onEngage).not.toHaveBeenCalled();
  });

  it("data-no-tab-swipe 标记区域内不触发", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    const dockArea = document.createElement("div");
    dockArea.setAttribute("data-no-tab-swipe", "");
    document.body.appendChild(dockArea);
    try {
      dispatchTouch(dockArea, "touchstart", 300, 600);
      dispatchTouch(dockArea, "touchmove", 150, 602);
      dispatchTouch(dockArea, "touchend", 100, 602);
      expect(config.onEngage).not.toHaveBeenCalled();
    } finally {
      dockArea.remove();
    }
  });

  it("可横向滚动的祖先容器内不触发（chips 行让位）", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    Object.defineProperty(scroller, "scrollWidth", { value: 600 });
    Object.defineProperty(scroller, "clientWidth", { value: 375 });
    document.body.appendChild(scroller);
    try {
      dispatchTouch(scroller, "touchstart", 300, 100);
      dispatchTouch(scroller, "touchmove", 150, 102);
      dispatchTouch(scroller, "touchend", 100, 102);
      expect(config.onEngage).not.toHaveBeenCalled();
    } finally {
      scroller.remove();
    }
  });

  it("disabled 或非 tab 根时不触发", () => {
    const config = makeConfig({ enabled: false });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 150, 302);
    dispatchTouch(document.body, "touchend", 100, 302);
    expect(config.onEngage).not.toHaveBeenCalled();
  });

  it("commit 后手势未清期间（enabled=false）新触摸被忽略", () => {
    // PageHost 侧手势忙（进行中/落定/等栈落定）时置 enabled=false，
    // 防止落定动画中旧预览层被新手势半途卸载
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 200, 302);
    dispatchTouch(document.body, "touchend", 150, 302);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
    act(() => {
      config.enabled = false;
    });
    dispatchTouch(document.body, "touchstart", 300, 300);
    dispatchTouch(document.body, "touchmove", 150, 302);
    expect(config.onEngage).toHaveBeenCalledTimes(1);
  });

  it("onMove 进度按方向投影，反向拖动记 0", () => {
    const config = makeConfig({ activeTabKey: "home" });
    renderProbe(config);
    dispatchTouch(document.body, "touchstart", 200, 300);
    dispatchTouch(document.body, "touchmove", 100, 301);
    const forwardCalls = (config.onMove as ReturnType<typeof vi.fn>).mock.calls;
    const progressForward = forwardCalls[forwardCalls.length - 1]?.[0];
    expect(progressForward).toBeCloseTo(100 / 375, 5);
    dispatchTouch(document.body, "touchmove", 260, 301);
    const backwardCalls = (config.onMove as ReturnType<typeof vi.fn>).mock.calls;
    const progressBackward = backwardCalls[backwardCalls.length - 1]?.[0];
    expect(progressBackward).toBe(0);
  });
});
