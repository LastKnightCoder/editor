import { describe, expect, it } from "vitest";
import {
  buildPanTimeline,
  findNearestState,
  resolveEnabledStates,
  resolvePanLayout,
  resolveReleaseDecision,
} from "../panModel";

describe("components/panModel", () => {
  it("应默认启用 normal 与 full，且按层级排序", () => {
    expect(resolveEnabledStates()).toEqual(["normal", "full"]);
    expect(resolveEnabledStates(["full", "mini", "normal"])).toEqual([
      "mini",
      "normal",
      "full",
    ]);
  });

  it("应基于视口高度与配置生成状态 offset", () => {
    const layout = resolvePanLayout({
      viewportHeight: 1000,
      enabledStates: ["normal", "full"],
      heights: { normal: 850, mini: 300 },
    });
    expect(layout.offsets.full).toBe(0);
    expect(layout.offsets.normal).toBe(150);
    expect(layout.offsets.mini).toBe(700);
    expect(layout.lowestState).toBe("normal");
    expect(layout.highestState).toBe("full");
  });

  it("normal 态上滑超过阈值应切换到 full", () => {
    const layout = resolvePanLayout({
      viewportHeight: 1000,
      enabledStates: ["normal", "full"],
      heights: { normal: 850 },
    });
    const decision = resolveReleaseDecision({
      layout,
      startState: "normal",
      offset: 70,
      deltaY: -80,
      velocityY: -0.2,
      thresholdPx: 56,
      velocityThreshold: 0.35,
      closeOnSwipeDownFromLowest: true,
    });
    expect(decision).toEqual({ nextState: "full", shouldClose: false });
  });

  it("full 态下滑超过阈值应回到 normal", () => {
    const layout = resolvePanLayout({
      viewportHeight: 1000,
      enabledStates: ["normal", "full"],
      heights: { normal: 850 },
    });
    const decision = resolveReleaseDecision({
      layout,
      startState: "full",
      offset: 90,
      deltaY: 90,
      velocityY: 0.2,
      thresholdPx: 56,
      velocityThreshold: 0.35,
      closeOnSwipeDownFromLowest: true,
    });
    expect(decision).toEqual({ nextState: "normal", shouldClose: false });
  });

  it("最低态下滑超过阈值应触发关闭", () => {
    const layout = resolvePanLayout({
      viewportHeight: 1000,
      enabledStates: ["normal", "full"],
      heights: { normal: 850 },
    });
    const decision = resolveReleaseDecision({
      layout,
      startState: "normal",
      offset: 210,
      deltaY: 120,
      velocityY: 0.4,
      thresholdPx: 56,
      velocityThreshold: 0.35,
      closeOnSwipeDownFromLowest: true,
    });
    expect(decision).toEqual({ nextState: "normal", shouldClose: true });
  });

  it("低于阈值时应吸附到最近状态", () => {
    const layout = resolvePanLayout({
      viewportHeight: 1000,
      enabledStates: ["normal", "full"],
      heights: { normal: 850 },
    });
    expect(findNearestState(layout, 40)).toBe("full");
    const decision = resolveReleaseDecision({
      layout,
      startState: "normal",
      offset: 40,
      deltaY: -20,
      velocityY: -0.1,
      thresholdPx: 56,
      velocityThreshold: 0.35,
    });
    expect(decision).toEqual({ nextState: "full", shouldClose: false });
  });

  it("应输出可联动动画时间轴进度", () => {
    const layout = resolvePanLayout({
      viewportHeight: 1000,
      enabledStates: ["normal", "full"],
      heights: { normal: 800, mini: 300 },
    });
    const timeline = buildPanTimeline({
      layout,
      offset: 100,
      state: "normal",
      isDragging: true,
    });
    expect(timeline.overallProgress).toBeCloseTo(0.5, 4);
    expect(timeline.segmentProgress.normalToFull).toBeCloseTo(0.5, 4);
    expect(timeline.segmentProgress.miniToNormal).toBeCloseTo(1, 4);
    expect(timeline.isDragging).toBe(true);
  });
});
