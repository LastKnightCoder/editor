/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import type { BoardElement } from "../types";
import type { WhiteboardSnapshot } from "../extensions/api";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";
import { defineWhiteboardExtension, defineElement } from "../extensions/api";
import { useBoard } from "../hooks/useBoard";
import { useSelectState } from "../hooks/useSelectState";

/**
 * 点选的渲染与落库成本：选区变化只重渲选中态翻转的元素（布尔订阅 + 通知侧短路），
 * 未翻转元素与不订阅选区的元素零重渲；且点选（查看状态）不触发 onChange 落库信号。
 */

const renders: Record<string, number> = {};

/** 订阅选区的元素体（模拟内置元素组件的 useSelectState 用法） */
function CountingBody({ id }: { id: string }) {
  renders[id] = (renders[id] ?? 0) + 1;
  const { isSelected } = useSelectState(id);
  return <g data-testid={id} data-selected={isSelected} />;
}

/** 不订阅任何选区的对照组件 */
function PassiveBody({ id }: { id: string }) {
  renders[id] = (renders[id] ?? 0) + 1;
  return <g data-testid={id} />;
}

const countingExtension = defineWhiteboardExtension({
  id: "test.counting",
  elements: [
    defineElement({
      type: "test.card",
      isHit: (element, x, y) =>
        x >= element.x &&
        x <= element.x + element.width &&
        y >= element.y &&
        y <= element.y + element.height,
      render: ({ element }) =>
        element.id.endsWith("-passive") ? (
          <PassiveBody id={element.id} />
        ) : (
          <CountingBody id={element.id} />
        ),
    }),
  ],
  create: () => ({}),
});

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => Promise<void>;
  selectedOf: (id: string) => string | null;
  unmount: () => Promise<void>;
}

const renderBoard = async (
  onChange: (data: WhiteboardSnapshot) => void,
  initData: BoardElement[]
): Promise<RenderResult> => {
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
        extensions={[...createStandardWhiteboardExtensions(), countingExtension, capture]}
        initData={initData}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
        onChange={onChange}
      />
    );
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const fire = async (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        })
      );
    });
  };
  return {
    board,
    host,
    root,
    canvas,
    fire,
    selectedOf: (id: string) =>
      host.querySelector(`[data-testid="${id}"]`)?.getAttribute("data-selected") ?? null,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  for (const key of Object.keys(renders)) delete renders[key];
});

describe("点选的渲染与落库成本", () => {
  it("点选只重渲选中态翻转的元素，未翻转与未订阅元素零重渲", async () => {
    const onChange = vi.fn();
    const cardA = { id: "card-a", type: "test.card", x: 100, y: 100, width: 80, height: 60 };
    const cardB = { id: "card-b", type: "test.card", x: 300, y: 100, width: 80, height: 60 };
    const passive = {
      id: "card-z-passive",
      type: "test.card",
      x: 500,
      y: 100,
      width: 80,
      height: 60,
    };
    const { fire, selectedOf, unmount } = await renderBoard(onChange, [
      cardA,
      cardB,
      passive,
    ] as BoardElement[]);

    const rendersB0 = renders["card-b"]!;
    const rendersPassive0 = renders["card-z-passive"]!;

    // 点选 A：pointerdown + pointerup（无位移，不构成拖拽）
    onChange.mockClear();
    await fire("pointerdown", 140, 130);
    await fire("pointerup", 140, 130);

    // 选中态在 DOM 上生效（翻转元素完成渲染）
    expect(selectedOf("card-a")).toBe("true");
    expect(selectedOf("card-b")).toBe("false");
    // 未被选中的订阅元素与不订阅选区的元素都不重渲（此前 SelectionContext 会让整棵元素树重渲）
    expect(renders["card-b"]!).toBe(rendersB0);
    expect(renders["card-z-passive"]!).toBe(rendersPassive0);
    // 点选是查看状态：不触发 onChange 落库信号
    expect(onChange).not.toHaveBeenCalled();
    await unmount();
  });

  it("切换选中目标：两个目标的选中态翻转，其余元素零重渲", async () => {
    const onChange = vi.fn();
    const cardA = { id: "card-a", type: "test.card", x: 100, y: 100, width: 80, height: 60 };
    const cardB = { id: "card-b", type: "test.card", x: 300, y: 100, width: 80, height: 60 };
    const cardC = { id: "card-c", type: "test.card", x: 500, y: 100, width: 80, height: 60 };
    const { fire, selectedOf, unmount } = await renderBoard(onChange, [
      cardA,
      cardB,
      cardC,
    ] as BoardElement[]);

    await fire("pointerdown", 140, 130);
    await fire("pointerup", 140, 130);
    const rendersC1 = renders["card-c"]!;

    // 改选 B：A 取消、B 选中（DOM 翻转），C 选中态与渲染都不动
    await fire("pointerdown", 340, 130);
    await fire("pointerup", 340, 130);

    expect(selectedOf("card-a")).toBe("false");
    expect(selectedOf("card-b")).toBe("true");
    expect(selectedOf("card-c")).toBe("false");
    expect(renders["card-c"]!).toBe(rendersC1);
    expect(onChange).not.toHaveBeenCalled();
    await unmount();
  });

  it("框选：圈外的元素零重渲，圈选框持续更新", async () => {
    const onChange = vi.fn();
    const cardA = { id: "card-a", type: "test.card", x: 100, y: 100, width: 80, height: 60 };
    const cardFar = { id: "card-far", type: "test.card", x: 2000, y: 2000, width: 80, height: 60 };
    const { fire, selectedOf, unmount } = await renderBoard(onChange, [
      cardA,
      cardFar,
    ] as BoardElement[]);

    const rendersFar0 = renders["card-far"]!;

    // 从空白处拉框圈住 A：每帧框扩大、选区逐帧变化
    onChange.mockClear();
    await fire("pointerdown", 50, 90);
    for (let i = 1; i <= 5; i++) {
      await fire("pointermove", 50 + i * 30, 90 + i * 20);
    }
    await fire("pointerup", 200, 190);

    // 圈外的元素（含视口外）零重渲——剔除/分层每帧重建包装时子树 bail out
    //（修复前每个框选帧都全量重建元素树：视口外元素也重渲）；框选不触发落库
    expect(renders["card-far"]!).toBe(rendersFar0);
    expect(onChange).not.toHaveBeenCalled();
    await unmount();
  });
});
