import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import Board from "../../../Board";
import { BoardContext } from "../../../context";
import { createArrowExtension, createMindExtension } from "../../../extensions/builtins";
import type { ArrowElement, MindNodeElement } from "../../../types";
import { createMindRelation } from "../../../utils/mindRelation";
import ArrowElementComponent from "..";

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

function RelationViews({ board }: { board: Board }) {
  const children = useSyncExternalStore(
    notify => {
      board.on("value:change", notify);
      return () => board.off("value:change", notify);
    },
    () => board.children
  );
  return (
    <svg>
      {children
        .filter(element => element.type === "arrow")
        .map(element => (
          <ArrowElementComponent key={element.id} element={element as ArrowElement} />
        ))}
    </svg>
  );
}

async function mountedRelations(count: number, readId?: () => void) {
  const kids = Array.from({ length: count }, (_, i) => {
    const value = { ...node(`n${i}`), level: 2, x: 200, y: i * 80 };
    if (readId)
      Object.defineProperty(value, "id", {
        get: () => {
          readId();
          return `n${i}`;
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
  board.installExtensions([createMindExtension(), createArrowExtension()]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <BoardContext.Provider value={board}>
        <RelationViews board={board} />
      </BoardContext.Provider>
    );
  });
  return {
    board,
    dispose: async () => {
      await act(async () => root.unmount());
      board.destroy();
      host.remove();
    },
  };
}

it("单节点编辑与批量移动的联系线投影不逐线遍历画布", async () => {
  // 仅改一个节点颜色曾让 1000 节点和 500 条线产生约百万次身份读取。
  let reads = 0;
  const count = 256;
  const f = await mountedRelations(count, () => reads++);
  try {
    reads = 0;
    await act(async () => {
      f.board.apply({
        type: "set_node",
        path: [0, 0],
        properties: {},
        newProperties: { textColor: "#ff0000" },
      });
    });
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(count * 16);
    await act(async () => {
      f.board.apply(
        Array.from({ length: count }, (_, i) => ({
          type: "set_node" as const,
          path: [0, i],
          properties: { x: 200 },
          newProperties: { x: 300 },
        }))
      );
    });
    for (const arrow of f.board.children.slice(1) as ArrowElement[])
      for (const point of arrow.points) expect(point.x).toBe(340);
  } finally {
    await f.dispose();
  }
});

it.skipIf(process.env.WHITEBOARD_MIND_STRESS !== "1")(
  "真实箭头视图下的单节点编辑和整批端点移动压力",
  async () => {
    for (const count of [100, 500, 1000]) {
      const f = await mountedRelations(count);
      try {
        await act(async () => {
          f.board.apply({
            type: "set_node",
            path: [0, 0],
            properties: {},
            newProperties: { textColor: "#000000" },
          });
        });
        for (const mode of ["single", "batch"]) {
          const samples: number[] = [];
          for (let round = 0; round < 3; round++) {
            const start = performance.now();
            await act(async () => {
              f.board.apply(
                mode === "single"
                  ? {
                      type: "set_node",
                      path: [0, 0],
                      properties: {},
                      newProperties: { textColor: round % 2 ? "#000000" : "#ff0000" },
                    }
                  : Array.from({ length: count }, (_, i) => ({
                      type: "set_node" as const,
                      path: [0, i],
                      properties: {},
                      newProperties: { x: round % 2 ? 200 : 300 },
                    }))
              );
            });
            samples.push(performance.now() - start);
            if (mode === "batch")
              for (const arrow of f.board.children.slice(1) as ArrowElement[])
                for (const point of arrow.points) expect(point.x).toBe(round % 2 ? 240 : 340);
          }
          console.log("MIND_COMPONENT_EDIT", JSON.stringify({ count, mode, samples }));
        }
      } finally {
        await f.dispose();
      }
    }
  },
  120000
);
