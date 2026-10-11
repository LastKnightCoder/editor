import { afterEach, describe, expect, it, vi } from "vitest";
import Board from "../../Board";
import { DEFAULT_PAGE_SKETCH, type BoardElement, type PageSketch } from "../../types";
import { SketchTransforms } from "../../transforms";

const rect = (id: string): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
});

const createBoard = (sketch?: PageSketch, readonly = false) =>
  new Board(
    [rect("a")],
    { minX: 0, minY: 0, width: 1000, height: 800, zoom: 1 } as any,
    { selectedElements: [], selectArea: null } as any,
    [],
    [],
    readonly,
    sketch
  );

const toSketch = (board: Board, mode: PageSketch["mode"]) =>
  board.apply({
    type: "set_sketch",
    properties: { mode: board.sketch.mode },
    newProperties: { mode },
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("Board 页级画风（set_sketch）", () => {
  it("缺省为普通，构造参数可传入页面画风", () => {
    expect(createBoard().sketch).toEqual(DEFAULT_PAGE_SKETCH);
    expect(createBoard({ mode: "sketch", level: "loose" }).sketch).toEqual({
      mode: "sketch",
      level: "loose",
    });
  });

  it("应用后更新画风、快照，并发出 sketch:change 与 change", () => {
    const board = createBoard();
    const onSketch = vi.fn();
    const onChange = vi.fn();
    board.on("sketch:change", onSketch);
    board.on("change", onChange);

    toSketch(board, "sketch");

    expect(board.sketch).toEqual({ mode: "sketch", level: "natural" });
    expect(board.getSnapshot().sketch).toBe(board.sketch);
    expect(onSketch).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("不可变替换：旧画风对象不被修改（useSyncExternalStore 依赖引用变化）", () => {
    const initial: PageSketch = { mode: "normal", level: "natural" };
    const board = createBoard(initial);
    toSketch(board, "sketch");
    expect(initial.mode).toBe("normal");
    expect(board.sketch).not.toBe(initial);
  });

  it("进撤销历史：撤销恢复、重做再切回", () => {
    const board = createBoard();
    toSketch(board, "sketch");
    board.undo();
    expect(board.sketch.mode).toBe("normal");
    board.redo();
    expect(board.sketch.mode).toBe("sketch");
  });

  it("与 1 秒内的元素改动（如字体变化后的尺寸回写）合并为同一个撤销条目", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const board = createBoard();
    toSketch(board, "sketch");
    vi.setSystemTime(10_300);
    board.apply({
      type: "set_node",
      path: [0],
      properties: { height: 80 },
      newProperties: { height: 96 },
    });

    board.undo();
    expect(board.sketch.mode).toBe("normal");
    expect(board.children[0].height).toBe(80);
  });

  it("只读白板不应用", () => {
    const board = createBoard(undefined, true);
    toSketch(board, "sketch");
    expect(board.sketch.mode).toBe("normal");
  });

  it("SketchTransforms.setPageSketch：值未变化不产生操作，只记录变化的字段", () => {
    const board = createBoard();
    const onChange = vi.fn();
    board.on("change", onChange);

    SketchTransforms.setPageSketch(board, { mode: "normal", level: "natural" });
    expect(onChange).not.toHaveBeenCalled();
    expect(board.undos).toHaveLength(0);

    SketchTransforms.setPageSketch(board, { mode: "sketch", level: "natural" });
    expect(board.undos[0]).toEqual([
      expect.objectContaining({
        type: "set_sketch",
        properties: { mode: "normal" },
        newProperties: { mode: "sketch" },
      }),
    ]);
  });
});
