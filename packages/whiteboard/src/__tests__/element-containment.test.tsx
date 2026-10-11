/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import { FRAME_TOOL_ID, COLUMN_TOOL_ID } from "../constants/tools";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";
import {
  createDocumentExtension,
  createWhiteboardReferenceExtension,
} from "../extensions/builtins";
import {
  defineWhiteboardExtension,
  defineElement,
  type ElementContainmentSpec,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { useBoard } from "../hooks/useBoard";
import type { BoardElement } from "../types";

const boxSeed = (id: string, type: string, x = 120, y = 120, width = 80, height = 60) =>
  ({ id, type, x, y, width, height }) as BoardElement;

/** 声明收纳能力的第三方扩展 acme.card：每个用例只装一个元素类型 acme.card.box */
const acmeCardExtension = (containment?: ElementContainmentSpec): WhiteboardExtension =>
  defineWhiteboardExtension({
    id: "acme.card",
    create: () => ({
      elements: [defineElement({ type: "acme.card.box", render: () => null, containment })],
    }),
  });

const acmeCardSeed = (id = "card") => boxSeed(id, "acme.card.box", 250, 150, 60, 50);

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => Promise<void>;
  unmount: () => Promise<void>;
}

const renderWhiteBoard = async (
  initData: BoardElement[],
  extraExtensions: readonly WhiteboardExtension[] = []
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
  const extensions: readonly WhiteboardExtension[] = [
    ...createStandardWhiteboardExtensions(),
    ...extraExtensions,
    defineWhiteboardExtension({
      id: "test.capture",
      create: () => ({
        layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
      }),
    }),
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WhiteBoard
        extensions={extensions}
        initData={initData}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
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
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("内置元素收纳行为不变", () => {
  it("六个内容元素可进 column，geometry 不能进 column", async () => {
    // document 与 whiteboard 由宿主按需装配，不在标准集合里，这里显式挂上以覆盖其插件声明
    const { board, unmount } = await renderWhiteBoard(
      [],
      [createDocumentExtension({}), createWhiteboardReferenceExtension({})]
    );
    const api = board.extensions!.api;
    for (const type of ["richtext", "image", "video", "audio", "document", "whiteboard"]) {
      expect(api.canContain("column", boxSeed(`el-${type}`, type)), type).toBe(true);
    }
    expect(api.canContain("column", boxSeed("shape", "geometry"))).toBe(false);
    await unmount();
  });

  it("mind-node 规则不变：可进 mind-node 与 frame、不能进 column，非 mind-node 不能进 mind-node", async () => {
    const { board, unmount } = await renderWhiteBoard([]);
    const api = board.extensions!.api;
    const mindNode = boxSeed("mind", "mind-node");
    expect(api.canContain("mind-node", mindNode)).toBe(true);
    expect(api.canContain("frame", mindNode)).toBe(true);
    expect(api.canContain("column", mindNode)).toBe(false);
    expect(api.canContain("mind-node", boxSeed("text", "richtext"))).toBe(false);
    await unmount();
  });

  it("真实容器实例的拖拽判定与类型查询一致（DraggingState 走同一 CapabilityService）", async () => {
    const { board, unmount } = await renderWhiteBoard([]);
    const frame = { id: "frame-1", type: "frame", x: 100, y: 100, width: 300, height: 200 };
    const column = { id: "column-1", type: "column", x: 100, y: 100, width: 300, height: 200 };
    const text = boxSeed("text", "richtext");
    expect(board.capabilityService.canContain(frame as BoardElement, text)).toBe(true);
    expect(board.capabilityService.canContain(column as BoardElement, text)).toBe(true);
    expect(
      board.capabilityService.canContain(column as BoardElement, boxSeed("shape", "geometry"))
    ).toBe(false);
    await unmount();
  });
});

describe("第三方元素收纳声明", () => {
  it("未声明 containment：能进 frame，不能进 column（手势与能力查询一致）", async () => {
    const card = acmeCardSeed();
    const { board, fire, unmount } = await renderWhiteBoard([card], [acmeCardExtension()]);
    const api = board.extensions!.api;
    expect(api.canContain("frame", card)).toBe(true);
    expect(api.canContain("column", card)).toBe(false);

    // 新建框架仍收纳未声明的第三方元素（与旧规则一致）
    board.setActiveTool(FRAME_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 400, 300);
    await fire("pointerup", 400, 300);
    const frame = board.children.find(element => element.type === "frame")!;
    expect(frame.children!.map(element => element.id)).toEqual(["card"]);
    await unmount();
  });

  it('joins:["layout"]：新建分栏收纳该元素，能力查询为 true', async () => {
    const card = acmeCardSeed();
    const shape = boxSeed("shape", "geometry", 300, 120, 60, 60);
    const { board, fire, unmount } = await renderWhiteBoard(
      [card, shape],
      [acmeCardExtension({ joins: ["layout"] })]
    );
    const api = board.extensions!.api;
    expect(api.canContain("column", card)).toBe(true);
    expect(api.canContain("frame", card)).toBe(true);

    board.setActiveTool(COLUMN_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 400, 300);
    await fire("pointerup", 400, 300);
    const column = board.children.find(element => element.type === "column")!;
    expect(column.children!.map(element => element.id)).toEqual(["card"]);
    expect(board.children.find(element => element.id === "shape")).toBeDefined();
    await unmount();
  });

  it("canBeContained:false：不进 frame 也不进 column（新建框架不收纳）", async () => {
    const card = acmeCardSeed();
    const { board, fire, unmount } = await renderWhiteBoard(
      [card],
      [acmeCardExtension({ canBeContained: false })]
    );
    const api = board.extensions!.api;
    expect(api.canContain("frame", card)).toBe(false);
    expect(api.canContain("column", card)).toBe(false);

    board.setActiveTool(FRAME_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 400, 300);
    await fire("pointerup", 400, 300);
    const frame = board.children.find(element => element.type === "frame")!;
    expect(frame.children ?? []).toEqual([]);
    expect(board.children.find(element => element.id === "card")).toBeDefined();
    await unmount();
  });

  it("版本不兼容（占位渲染）的元素仍按声明的收纳能力参与判定", async () => {
    const versioned = defineWhiteboardExtension({
      id: "acme.versioned",
      create: () => ({
        elements: [
          defineElement({
            type: "acme.versioned.box",
            render: () => null,
            schemaVersion: 2,
            migrate: { 1: element => element },
            containment: { joins: ["layout"] },
          }),
          defineElement({
            type: "acme.versioned.fixed",
            render: () => null,
            schemaVersion: 2,
            migrate: { 1: element => element },
            containment: { canBeContained: false },
          }),
        ],
      }),
    });
    // schemaVersion 3 比定义的 2 新：按 too-new 占位渲染
    const tooNew = { ...acmeCardSeed("too-new"), type: "acme.versioned.box", schemaVersion: 3 };
    const tooNewFixed = {
      ...acmeCardSeed("too-new-fixed"),
      type: "acme.versioned.fixed",
      schemaVersion: 3,
    };
    const { board, unmount } = await renderWhiteBoard([tooNew, tooNewFixed], [versioned]);
    const api = board.extensions!.api;
    expect(api.canContain("column", tooNew)).toBe(true);
    expect(api.canContain("column", tooNewFixed)).toBe(false);
    expect(api.canContain("frame", tooNewFixed)).toBe(false);
    await unmount();
  });
});

describe("装配校验", () => {
  it("joins 含未知容器类别时扩展被拒（invalid-definition）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: WhiteboardExtensionError[] = [];
    const board = new Board(
      [],
      { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      { selectedElements: [], selectArea: null }
    );
    board.installExtensions(
      [
        defineWhiteboardExtension({
          id: "acme.bad",
          create: () => ({
            elements: [
              defineElement({
                type: "acme.bad.box",
                render: () => null,
                containment: { joins: ["foo"] } as unknown as ElementContainmentSpec,
              }),
            ],
          }),
        }),
      ],
      error => errors.push(error)
    );
    board.destroy();
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toBe("invalid-definition");
    expect(errors[0].message).toContain("未知容器类别");
  });
});
