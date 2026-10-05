import { describe, expect, it } from "vitest";
import Board from "../../../Board";
import type { BoardElement } from "../../../types";
import { buildSketchOps, getSketchTargets, patchSketch } from "../batch";

const el = (id: string, type: string, extra: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  ...extra,
});

const mindChild = el("child", "mind-node", { level: 2, children: [] });
const mindRoot = el("root", "mind-node", { level: 1, children: [mindChild] });
const shape = el("shape", "geometry", { fill: "#8fb3e6", sketch: { level: "loose" } });
const arrow = el("arrow", "arrow");
const ink = el("ink", "handwrite");

const createBoard = () =>
  new Board(
    [shape, arrow, ink, mindRoot],
    { minX: 0, minY: 0, width: 1000, height: 800, zoom: 1 } as any,
    { selectedElements: [], selectArea: null } as any
  );

describe("patchSketch", () => {
  it("合并覆盖、undefined 删除字段、删空回到跟随页面", () => {
    expect(patchSketch(undefined, { mode: "sketch" })).toEqual({ mode: "sketch" });
    expect(patchSketch({ mode: "sketch", seed: 3 }, { mode: undefined })).toEqual({ seed: 3 });
    expect(patchSketch({ mode: "sketch" }, { mode: undefined })).toBeUndefined();
  });
});

describe("getSketchTargets", () => {
  it("导图节点归到根节点并去重，手写剔除", () => {
    const board = createBoard();
    const targets = getSketchTargets(board, [
      shape,
      arrow,
      ink,
      board.children[3].children![0],
      board.children[3],
    ]);
    expect(targets.map(t => t.id)).toEqual(["shape", "arrow", "root"]);
  });
});

describe("buildSketchOps", () => {
  it("只改 sketch 字段，批量应用后可一次撤销", () => {
    const board = createBoard();
    const targets = getSketchTargets(board, [shape, arrow]);
    board.apply(
      buildSketchOps(board, targets, e => ({ sketch: patchSketch(e.sketch, { mode: "normal" }) }))
    );

    expect(board.children[0].sketch).toEqual({ level: "loose", mode: "normal" });
    expect(board.children[1].sketch).toEqual({ mode: "normal" });
    expect(board.children[0].fill).toBe("#8fb3e6");

    board.undo();
    expect(board.children[0].sketch).toEqual({ level: "loose" });
    expect(board.children[1].sketch).toBeUndefined();
  });

  it("recipe 返回 null 的元素不产生操作（如非形状不改填充）", () => {
    const board = createBoard();
    const ops = buildSketchOps(board, [shape, arrow], e =>
      e.type === "geometry" ? { fillStyle: "hatch" } : null
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      newProperties: { fillStyle: "hatch" },
      properties: { fillStyle: undefined },
    });
  });
});
