/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import {
  SELECT_TOOL_ID,
  GEOMETRY_TOOL_ID,
  FRAME_TOOL_ID,
  COLUMN_TOOL_ID,
} from "../constants/tools";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";
import {
  defineWhiteboardExtension,
  defineElement,
  type WhiteboardExtension,
} from "../extensions/api";
import { buildGeometryElement } from "../extensions/creators/geometry";
import { GeometryUtil } from "../utils";
import { geometryItems } from "../components/Toolbar/Geometry/config";
import { useBoard } from "../hooks/useBoard";
import type { BoardElement, ContextMenuContext } from "../types";

const rectangleItem = geometryItems.find(item => item.geometryType === "rectangle")!;
const circleItem = geometryItems.find(item => item.geometryType === "circle")!;
const shapeOptions = (item: (typeof geometryItems)[number]) => ({
  ...item,
  geometryType: item.geometryType,
  defaultExtraInfo: item.defaultExtraInfo || {},
});

/** 旧 useCreateGeometry 的构造逻辑（迁移前源码原样），用于字段级对比 */
const legacyGeometryElement = (
  x: number,
  y: number,
  width: number,
  height: number,
  options: Record<string, unknown>
) => {
  const { cornerRadius, textAlign, ...geometryStyle } = GeometryUtil.getPrevGeometryStyle();
  return {
    type: "geometry",
    geometryType: (options.geometryType as string) || "default",
    paths: options.paths as string[],
    extraInfo: {
      ...(options.defaultExtraInfo as Record<string, unknown>),
      cornerRadius,
    },
    text: {
      align: textAlign,
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
    },
    x,
    y,
    width,
    height,
    ...geometryStyle,
  };
};

const geometrySeed = (id: string, x: number, y: number, width = 80, height = 60) =>
  ({ id, type: "geometry", x, y, width, height }) as BoardElement;

const richtextSeed = (id: string, x: number, y: number, width = 80, height = 60) =>
  ({
    id,
    type: "richtext",
    contentId: 1,
    x,
    y,
    width,
    height,
    maxWidth: width,
    maxHeight: height,
    resized: true,
    readonly: false,
    content: [{ type: "paragraph", children: [{ type: "formatted", text: id }] }],
  }) as BoardElement;

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    modifiers?: { shiftKey?: boolean; altKey?: boolean }
  ) => Promise<void>;
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
  const fire = async (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    modifiers?: { shiftKey?: boolean; altKey?: boolean }
  ) => {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
          shiftKey: !!modifiers?.shiftKey,
          altKey: !!modifiers?.altKey,
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

const emptyMenuContext = (board: Board): ContextMenuContext => ({
  board,
  clientX: 0,
  clientY: 0,
  viewPortPoint: { x: 0, y: 0 },
  selectedElements: [],
  hitElements: [],
  targetElements: [],
  isHitSelected: false,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("geometry 创建工具", () => {
  it("拖出矩形：字段与旧构造逻辑一致、单撤销步、创建后选中并回到选择工具，拖动中文档不变", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(GEOMETRY_TOOL_ID, shapeOptions(rectangleItem));

    const childrenBefore = board.children;
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160);
    expect(board.children).toBe(childrenBefore);
    expect(board.creationPreview?.element.type).toBe("geometry");

    await fire("pointerup", 200, 160);
    expect(board.children).toHaveLength(1);
    const created = board.children[0];
    // 除 id 外与旧构造逻辑深相等（坐标尺寸同参）
    const legacy = legacyGeometryElement(100, 100, 100, 60, shapeOptions(rectangleItem));
    expect({ ...created, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    expect(board.selection.selectedElements.map(element => element.id)).toEqual([created.id]);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.undos).toHaveLength(1);
    board.undo();
    expect(board.children).toHaveLength(0);
    await unmount();
  });

  it("Shift 等比、Alt 以按下点为中心", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(GEOMETRY_TOOL_ID, shapeOptions(rectangleItem));
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160, { shiftKey: true });
    await fire("pointerup", 200, 160, { shiftKey: true });
    expect(board.children[0]).toMatchObject({ x: 100, y: 100, width: 100, height: 100 });

    board.setActiveTool(GEOMETRY_TOOL_ID, shapeOptions(rectangleItem));
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 150, 130, { altKey: true });
    await fire("pointerup", 150, 130, { altKey: true });
    expect(board.children[1]).toMatchObject({ x: 50, y: 70, width: 100, height: 60 });
    await unmount();
  });

  it("单击不创建且工具保持", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(GEOMETRY_TOOL_ID, shapeOptions(rectangleItem));
    await fire("pointerdown", 100, 100);
    await fire("pointerup", 102, 100);
    expect(board.children).toHaveLength(0);
    expect(board.activeTool).toBe(GEOMETRY_TOOL_ID);
    await unmount();
  });

  it("选择圆形后再拖生成圆形（build 的纯函数输出与旧构造一致）", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(GEOMETRY_TOOL_ID, shapeOptions(circleItem));
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 180, 170);
    await fire("pointerup", 180, 170);
    expect(board.children[0].geometryType).toBe("circle");
    expect(board.children[0].paths).toEqual(circleItem.paths);

    const built = buildGeometryElement(
      { x: 0, y: 0, width: 10, height: 10 },
      shapeOptions(circleItem)
    )!;
    const legacy = legacyGeometryElement(0, 0, 10, 10, shapeOptions(circleItem));
    expect({ ...built, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    await unmount();
  });
});

describe("frame 创建工具", () => {
  const frameSeeds = () => [
    geometrySeed("inside-a", 120, 120),
    geometrySeed("inside-b", 250, 150, 100, 80),
    geometrySeed("partial-c", 395, 200, 120, 80),
  ];

  it("拖动中只预览并高亮将被收纳元素；松手一次性收纳、单撤销步；undo 深相等恢复、redo 再收纳", async () => {
    const seeds = frameSeeds();
    const { board, fire, unmount } = await renderWhiteBoard(seeds);
    board.setActiveTool(FRAME_TOOL_ID);

    const childrenBefore = board.children;
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 400, 300);
    expect(board.creationPreview?.highlight).toEqual(["inside-a", "inside-b"]);
    expect(board.children).toBe(childrenBefore);

    await fire("pointerup", 400, 300);
    expect(board.children).toHaveLength(2);
    const frame = board.children.find(element => element.type === "frame")!;
    expect(frame.children!.map(element => element.id)).toEqual(["inside-a", "inside-b"]);
    // 子元素坐标保持绝对坐标（旧实现规则）
    expect(frame.children![0]).toMatchObject({ x: 120, y: 120 });
    expect(board.children.find(element => element.id === "partial-c")).toBeDefined();
    expect(board.undos).toHaveLength(1);
    expect(board.selection.selectedElements.map(element => element.id)).toEqual([frame.id]);

    board.undo();
    expect(board.children).toStrictEqual(seeds);
    board.redo();
    const redone = board.children.find(element => element.type === "frame")!;
    expect(board.children.find(element => element.id === "partial-c")).toBeDefined();
    expect(redone.children!.map(element => element.id)).toEqual(["inside-a", "inside-b"]);
    await unmount();
  });

  it("不足 10×10 不创建", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(FRAME_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 105, 104);
    await fire("pointerup", 105, 104);
    expect(board.children).toHaveLength(0);
    expect(board.undos).toHaveLength(0);
    await unmount();
  });
});

describe("column 创建工具", () => {
  it("松手收纳与布局：子元素按列宽排布、非准入类型留在根层、单撤销步；undo/redo 恢复", async () => {
    const seeds = [
      richtextSeed("text-a", 120, 120),
      richtextSeed("text-b", 250, 150, 60, 50),
      geometrySeed("shape", 300, 120, 60, 60),
    ];
    const { board, fire, unmount } = await renderWhiteBoard(seeds);
    board.setActiveTool(COLUMN_TOOL_ID);

    const childrenBefore = board.children;
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 400, 300);
    expect(board.creationPreview?.highlight).toEqual(["text-a", "text-b"]);
    expect(board.children).toBe(childrenBefore);

    await fire("pointerup", 400, 300);
    expect(board.children).toHaveLength(2);
    const column = board.children.find(element => element.type === "column")!;
    expect(board.children.find(element => element.id === "shape")).toBeDefined();
    expect(column.children!.map(element => element.id)).toEqual(["text-a", "text-b"]);
    expect(column).toMatchObject({ x: 100, y: 100, width: 300, height: 186 });
    // 布局：内容宽 300 - 8*2，首子元素从标题栏 + padding 起排
    expect(column.children![0]).toMatchObject({
      x: 108,
      y: 160,
      width: 284,
      resizable: false,
      autoHeight: true,
    });
    expect(column.children![1]).toMatchObject({ x: 108, y: 228, width: 284 });
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(board.children).toStrictEqual(seeds);
    board.redo();
    const redone = board.children.find(element => element.type === "column")!;
    expect(redone.children!.map(element => element.id)).toEqual(["text-a", "text-b"]);
    expect(board.children.find(element => element.id === "shape")).toBeDefined();
    await unmount();
  });

  it("宽不足 50 不创建", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(COLUMN_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 140, 300);
    await fire("pointerup", 140, 300);
    expect(board.children).toHaveLength(0);
    expect(board.undos).toHaveLength(0);
    await unmount();
  });

  it("未声明收纳能力的第三方元素不进入分栏（准入走 api.canContain 能力查询）", async () => {
    const cardExtension = defineWhiteboardExtension({
      id: "acme.card",
      elements: [
        defineElement({
          type: "acme.card.box",
          render: () => null,
        }),
      ],
      create: () => ({}),
    });
    const seeds = [
      richtextSeed("text-a", 120, 120),
      {
        id: "card",
        type: "acme.card.box",
        x: 250,
        y: 150,
        width: 60,
        height: 50,
        data: {},
      } as BoardElement,
    ];
    const { board, fire, unmount } = await renderWhiteBoard(seeds, [cardExtension]);
    board.setActiveTool(COLUMN_TOOL_ID);

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 400, 300);
    await fire("pointerup", 400, 300);
    const column = board.children.find(element => element.type === "column")!;
    expect(column.children!.map(element => element.id)).toEqual(["text-a"]);
    expect(board.children.find(element => element.id === "card")).toBeDefined();
    await unmount();
  });
});

describe("右键菜单入口", () => {
  it("空白处右键菜单激活 geometry/frame/column 创建工具", async () => {
    const { board, unmount } = await renderWhiteBoard([]);

    const geometryMenu = board.getPlugin("geometry")!.getContextMenu!(emptyMenuContext(board));
    const shapeEntry = geometryMenu
      .find(item => item.key === "create-geometry")!
      .children!.find(item => item.key === "create-geometry-rectangle")!;
    shapeEntry.onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(GEOMETRY_TOOL_ID);
    expect(board.activeToolOptions?.geometryType).toBe("rectangle");

    board.getPlugin("frame")!.getContextMenu!(emptyMenuContext(board))
      .find(item => item.key === "create-frame")!
      .onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(FRAME_TOOL_ID);

    board.getPlugin("column")!.getContextMenu!(emptyMenuContext(board))
      .find(item => item.key === "create-column")!
      .onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(COLUMN_TOOL_ID);
    await unmount();
  });
});
