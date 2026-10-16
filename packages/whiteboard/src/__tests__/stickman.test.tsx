/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import type { BoardElement } from "../types";
import { SELECT_TOOL_ID, STICKMAN_TOOL_ID } from "../constants/tools";
import { STICK_INK } from "../constants/stickman";
import { createInteractionExtension, createStickmanExtension } from "../extensions/builtins";
import { defineWhiteboardExtension } from "../extensions/api";
import { useBoard } from "../hooks/useBoard";
import { buildSchematic } from "../schematic/schematic";
import { elementLabel, elementTypeMeta } from "../components/Sidebar/tree/typeMeta";
import { resolveSketch } from "../utils/sketch";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function renderBoard(initData: BoardElement[] = []) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let board!: Board;
  function Capture() {
    board = useBoard();
    return null;
  }
  const capture = defineWhiteboardExtension({
    id: "test.capture",
    create: () => ({
      layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
    }),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WhiteBoard
        extensions={[createInteractionExtension(), createStickmanExtension(), capture]}
        initData={initData}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
      />
    );
  });
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const click = async (x: number, y: number) => {
    for (const type of ["pointerdown", "pointerup"] as const) {
      await act(async () => {
        canvas.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === "pointerdown" ? 1 : 0,
            clientX: x,
            clientY: y,
          })
        );
      });
    }
  };
  return { board: () => board, host, click };
}

describe("人物元素", () => {
  it("单击放置：按姿态自然尺寸以点击点为中心，选中后回到选择工具", async () => {
    const { board, click } = await renderBoard();
    act(() => void board().setActiveTool(STICKMAN_TOOL_ID, { pose: "wave" }));
    await click(200, 150);

    const [element] = board().children;
    expect(element).toMatchObject({
      type: "stickman",
      pose: "wave",
      body: "classic",
      tint: "color",
      x: 200 - 66,
      y: 150 - 86,
      width: 132,
      height: 172,
    });
    expect(board().selection.selectedElements.map(e => e.id)).toEqual([element.id]);
    expect(board().activeTool).toBe(SELECT_TOOL_ID);
  });

  it("新建人物沿用最近一次选择的形体与着色", async () => {
    localStorage.setItem("whiteboard-stickman-body", "bean");
    localStorage.setItem("whiteboard-stickman-tint", "mono");
    const { board, click } = await renderBoard();
    act(() => void board().setActiveTool(STICKMAN_TOOL_ID, { pose: "team" }));
    await click(300, 200);
    expect(board().children[0]).toMatchObject({ pose: "team", body: "bean", tint: "mono" });
  });

  it("渲染墨色走主题变量；未知姿态保留数据并画占位框", async () => {
    const { host, board } = await renderBoard([
      {
        id: "a",
        type: "stickman",
        pose: "idea",
        body: "glyph",
        tint: "color",
        x: 0,
        y: 0,
        width: 132,
        height: 172,
      },
      {
        id: "b",
        type: "stickman",
        pose: "from-the-future",
        body: "classic",
        tint: "mono",
        x: 300,
        y: 0,
        width: 132,
        height: 172,
      },
    ] as BoardElement[]);
    const strokes = Array.from(host.querySelectorAll("path[stroke]")).map(p =>
      p.getAttribute("stroke")
    );
    expect(strokes).toContain(STICK_INK);
    expect(host.querySelector("rect[stroke-dasharray]")).not.toBeNull();
    expect(board().children[1]).toMatchObject({ pose: "from-the-future" });
  });
});

describe("人物的周边登记", () => {
  const element = {
    id: "s",
    type: "stickman",
    pose: "wave",
    body: "classic",
    tint: "color",
    x: 10,
    y: 20,
    width: 132,
    height: 172,
  } as BoardElement;

  it("跟随页级手绘模式", () => {
    expect(resolveSketch({ mode: "sketch", level: "natural" }, element).enabled).toBe(true);
  });

  it("元素树显示类型名与姿态名", () => {
    expect(elementTypeMeta("stickman").label).toBe("人物");
    expect(elementLabel(element)).toBe("挥手");
    expect(elementLabel({ ...element, name: "产品经理" })).toBe("产品经理");
  });

  it("示意图画出线稿而不是占位块", () => {
    const schematic = buildSchematic([element], { aspect: 1.6, dark: false })!;
    expect(schematic.shapes.length).toBeGreaterThan(5);
    expect(schematic.shapes.every(s => s.kind === "path" && s.box?.x === 10)).toBe(true);
  });
});
