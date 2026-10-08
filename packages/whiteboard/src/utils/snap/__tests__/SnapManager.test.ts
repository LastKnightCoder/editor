import { afterEach, describe, expect, it, vi } from "vitest";
import Board from "../../../Board";
import { EHandlerPosition, type BoardElement, type ViewPort } from "../../../types";

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  ...overrides,
});

const createBoard = (children: BoardElement[], zoom = 1) =>
  new Board(
    children,
    { minX: 0, minY: 0, width: 1000, height: 800, zoom } as ViewPort,
    { selectedElements: [], selectArea: null },
    [],
    []
  );

describe("SnapManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("移动吸附排除运动元素自身，并产生参考线", () => {
    const moving = createRect("moving", { x: 300, y: 300 });
    const board = createBoard([createRect("ref"), moving]);

    const result = board.snap.move({
      elements: [moving],
      bounds: { x: 104, y: 300, width: 100, height: 100 },
      enabled: true,
    });

    expect(result).toEqual({ dx: -4, dy: 0 });
    expect(board.snap.getGuides().length).toBeGreaterThan(0);
  });

  it("容器子孙不作为候选", () => {
    const child = createRect("child", { x: 500, y: 500 });
    const frame = createRect("frame", {
      x: 400,
      y: 400,
      width: 300,
      height: 300,
      children: [child],
    });
    const board = createBoard([frame]);

    const result = board.snap.move({
      elements: [frame],
      bounds: { x: 502, y: 600, width: 300, height: 300 },
      enabled: true,
    });

    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it("视口外的元素不作为候选", () => {
    const board = createBoard([createRect("far", { x: 5000, y: 0 })]);
    const result = board.snap.move({
      elements: [],
      bounds: { x: 5003, y: 300, width: 100, height: 100 },
      enabled: true,
    });
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it("阈值按屏幕像素换算：放大后画布距离阈值变小", () => {
    const board = createBoard([createRect("ref")], 4);
    const result = board.snap.move({
      elements: [],
      bounds: { x: 103, y: 300, width: 100, height: 100 },
      enabled: true,
    });
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it("关闭吸附时不偏移且清空参考线", () => {
    const board = createBoard([createRect("ref")]);
    board.snap.move({
      elements: [],
      bounds: { x: 103, y: 300, width: 100, height: 100 },
      enabled: true,
    });
    expect(board.snap.getGuides().length).toBeGreaterThan(0);

    const result = board.snap.move({
      elements: [],
      bounds: { x: 103, y: 300, width: 100, height: 100 },
      enabled: false,
    });
    expect(result).toEqual({ dx: 0, dy: 0 });
    expect(board.snap.getGuides()).toEqual([]);
  });

  it("网格模式取整且不画线", () => {
    const board = createBoard([createRect("ref")]);
    board.snap.setGridSize(20);
    const result = board.snap.move({
      elements: [],
      bounds: { x: 103, y: 307, width: 100, height: 100 },
      enabled: true,
    });
    expect(result).toEqual({ dx: -3, dy: -7 });
    expect(board.snap.getGuides()).toEqual([]);
  });

  it("等比缩放只吸附主轴并按比例回算另一维", () => {
    const target = createRect("target", { x: 500, y: 300 });
    const board = createBoard([createRect("ref", { x: 0, y: 0, width: 200, height: 10 }), target]);

    const snapped = board.snap.resize({
      element: target,
      bounds: { x: 3, y: 300, width: 194, height: 97 },
      position: EHandlerPosition.BottomRight,
      enabled: true,
      preserveRatio: true,
    });
    // 右边 197 吸到 200，宽 197，高按 2:1 回算
    expect(snapped).toEqual({ x: 3, y: 300, width: 197, height: 98.5 });
  });

  it("axes 限定只吸附 x 轴", () => {
    const target = createRect("target", { x: 500, y: 500 });
    const board = createBoard([createRect("ref"), target]);
    const bounds = board.snap.resize({
      element: target,
      bounds: { x: 0, y: 0, width: 97, height: 97 },
      position: EHandlerPosition.BottomRight,
      enabled: true,
      axes: ["x"],
    });
    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 97 });
  });

  it("任意指针抬起后兜底清空参考线", () => {
    vi.useFakeTimers();
    const board = createBoard([createRect("ref")]);
    board.snap.move({
      elements: [],
      bounds: { x: 103, y: 300, width: 100, height: 100 },
      enabled: true,
    });
    expect(board.snap.getGuides().length).toBeGreaterThan(0);

    window.dispatchEvent(new Event("pointerup"));
    vi.runAllTimers();

    expect(board.snap.getGuides()).toEqual([]);
  });

  it("窗口失焦立即清空参考线，并通知订阅者", () => {
    const board = createBoard([createRect("ref")]);
    const listener = vi.fn();
    board.snap.subscribe(listener);
    board.snap.move({
      elements: [],
      bounds: { x: 103, y: 300, width: 100, height: 100 },
      enabled: true,
    });

    window.dispatchEvent(new Event("blur"));

    expect(board.snap.getGuides()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
