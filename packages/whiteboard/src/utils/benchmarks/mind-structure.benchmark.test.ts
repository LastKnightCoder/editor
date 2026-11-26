import { expect, it } from "vitest";
import MindUtil from "../MindUtil";
import type { MindNodeElement } from "../../types";
import { boundaryBox } from "../mind-layout/ranges";
import Board from "../../Board";
import { MindPlugin } from "../../plugins/MindPlugin";
import { createMindRelation, mindRelationOpacity } from "../mindRelation";

const node = (id: string, children: MindNodeElement[] = []): MindNodeElement => ({
  id,
  type: "mind-node",
  x: 0,
  y: 0,
  width: 80,
  height: 40,
  actualHeight: 40,
  level: 1,
  direction: "right",
  text: [],
  children,
  childrenHeight: 0,
  leftChildrenHeight: 0,
  rightChildrenHeight: 0,
});

it.skipIf(process.env.WHITEBOARD_MIND_STRESS !== "1")(
  "大量概要外框与深层嵌套几何压力",
  () => {
    for (const count of [100, 500, 1000, 2000])
      for (const layout of ["mind", "logic", "org", "tree"]) {
        const kids = Array.from({ length: count }, (_, i) => node(`n${i}`));
        const boundaries = Array.from({ length: count / 5 }, (_, i) => ({
          id: `b${i}`,
          startId: `n${i * 5}`,
          endId: `n${i * 5 + 4}`,
          title: "分组",
        }));
        const summaries = Array.from({ length: count / 10 }, (_, i) => ({
          ...node(`s${i}`),
          summaryRange: { startId: `n${i * 10}`, endId: `n${i * 10 + 9}` },
        }));
        const tree = { ...node("root", [...kids, ...summaries]), layout, boundaries };
        const samples: number[] = [];
        for (let round = 0; round < 3; round++) {
          const start = performance.now();
          const placed = MindUtil.layout(tree);
          samples.push(performance.now() - start);
          const ids = new Set<string>();
          MindUtil.dfs(placed, {
            before: current => {
              expect(ids.has(current.id)).toBe(false);
              ids.add(current.id);
              expect(Number.isFinite(current.x) && Number.isFinite(current.y)).toBe(true);
            },
          });
          expect(ids.size).toBe(kids.length + summaries.length + 1);
          const all: MindNodeElement[] = [];
          MindUtil.dfs(placed, { before: current => void all.push(current) });
          for (const summary of all.filter(current => current.summaryRange))
            for (const other of all) {
              if (summary.id === other.id) continue;
              expect(
                summary.x + summary.width <= other.x ||
                  other.x + other.width <= summary.x ||
                  summary.y + summary.height <= other.y ||
                  other.y + other.height <= summary.y
              ).toBe(true);
            }
        }
        console.log("MIND_LAYOUT", JSON.stringify({ count, layout, samples }));
      }
    for (const depth of [8, 16, 32, 63]) {
      let tree = node("leaf");
      for (let i = 0; i < depth; i++)
        tree = {
          ...node(`d${i}`, [tree]),
          boundaries: [{ id: `b${i}`, startId: tree.id, endId: tree.id }],
        };
      const start = performance.now();
      const box = boundaryBox(tree, tree.boundaries![0], false)!;
      expect(Number.isFinite(box.width) && box.width > tree.width).toBe(true);
      console.log("MIND_DEPTH", JSON.stringify({ depth, ms: performance.now() - start }));
    }
  },
  120000
);

it.skipIf(process.env.WHITEBOARD_MIND_STRESS !== "1")(
  "大量联系线的冷查询、快照复用与身份访问次数压力",
  () => {
    for (const mode of ["plain", "tracked"])
      for (const count of [100, 500, 1000, 2000]) {
        let reads = 0;
        const kids = Array.from({ length: count }, (_, i) => {
          const value = { ...node(`node-${i}`), level: 2, x: 200, y: i * 80 };
          if (mode === "tracked")
            Object.defineProperty(value, "id", {
              get: () => {
                reads++;
                return `node-${i}`;
              },
              enumerable: true,
            });
          return value;
        });
        const arrows = Array.from({ length: count / 2 }, (_, i) =>
          createMindRelation(kids[i * 2], kids[i * 2 + 1])
        );
        const board = new Board(
          [node("root", kids), ...arrows],
          { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
          { selectedElements: [], selectArea: null }
        );
        const plugin = new MindPlugin();
        const samples: number[] = [],
          idReads: number[] = [];
        try {
          for (let round = 0; round < 3; round++) {
            reads = 0;
            const start = performance.now();
            for (const [i, arrow] of arrows.entries()) {
              const opacity = mindRelationOpacity(board, arrow);
              const from = plugin.getArrowBindPoint(board, kids[i * 2], "center");
              const to = plugin.getArrowBindPoint(board, kids[i * 2 + 1], "center");
              if (
                typeof opacity !== "number" ||
                !Number.isFinite(opacity) ||
                !Number.isFinite(from.x) ||
                !Number.isFinite(to.y)
              )
                throw new Error("联系线几何无效");
            }
            samples.push(performance.now() - start);
            idReads.push(reads);
            if (mode === "tracked") expect(reads).toBeLessThanOrEqual(count * 6);
          }
          console.log(
            "MIND_RELATION_BATCH",
            JSON.stringify({ mode, nodes: count, relations: arrows.length, samples, idReads })
          );
        } finally {
          board.destroy();
        }
      }
  }
);
