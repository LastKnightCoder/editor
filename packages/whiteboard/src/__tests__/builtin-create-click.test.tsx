/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import type { BoardElement, ContextMenuContext, MindNodeElement, Operation } from "../types";
import { SELECT_TOOL_ID, RICHTEXT_TOOL_ID, MIND_TOOL_ID } from "../constants/tools";
import {
  createInteractionExtension,
  createRichTextExtension,
  createMindExtension,
} from "../extensions/builtins";
import {
  defineWhiteboardExtension,
  defineElement,
  type WhiteboardExtension,
} from "../extensions/api";
import {
  IWhiteboardRichText,
  createEmbeddedRichTextService,
  embeddedTextOptions,
} from "../extensions/text";
import { createServiceRegistry, type ServiceRegistry } from "../extensions";
import { buildMindRootElement } from "../extensions/creators/mind";
import { RichTextUtil } from "../utils/TextStyleStore";
import { createEmptyRichTextContent } from "../utils/RichTextContentUtil";
import { useBoard } from "../hooks/useBoard";

/** 旧 insertRichText 的构造逻辑（迁移前源码原样，embedded 无 create 时 contentId 为 undefined） */
const legacyRichTextElement = (x: number, y: number) => ({
  type: "richtext",
  x,
  y,
  width: 180,
  height: 72,
  maxWidth: 300,
  maxHeight: 1000,
  readonly: false,
  resized: false,
  content: createEmptyRichTextContent(),
  contentId: undefined,
  autoFocus: true,
  ...RichTextUtil.load(),
});

/** 旧 MindPlugin.createMindRoot 的构造逻辑（迁移前源码原样） */
const legacyMindRoot = (x: number, y: number, fontSize: number) => {
  const lineHeight = fontSize * 1.57;
  const totalHeight = lineHeight + 16 * 2;
  return {
    type: "mind-node",
    x,
    y,
    width: 24,
    height: totalHeight,
    actualHeight: totalHeight,
    level: 1,
    leftChildrenHeight: 0,
    rightChildrenHeight: 0,
    childrenHeight: 0,
    direction: "right" as const,
    text: [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "", bold: true }],
      },
    ],
    children: [],
    defaultFocus: true,
    isLeftFold: false,
    isRightFold: false,
    themeId: expect.any(String),
    themeStyle: expect.anything(),
  };
};

const geometrySeed = (id: string, x: number, y: number): BoardElement =>
  ({ id, type: "geometry", x, y, width: 80, height: 60 }) as BoardElement;

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (type: "pointerdown" | "pointerup" | "dblclick", x: number, y: number) => Promise<void>;
  flush: () => Promise<void>;
  unmount: () => Promise<void>;
}

const renderClickBoard = async (
  extensions: readonly WhiteboardExtension[],
  initData: BoardElement[] = [],
  services?: ServiceRegistry
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
        extensions={[...extensions, capture]}
        services={services}
        initData={initData}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
      />
    );
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const fire = async (type: "pointerdown" | "pointerup" | "dblclick", x: number, y: number) => {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" || type === "dblclick" ? 0 : 1,
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
    flush: async () => {
      await act(async () => {});
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

/** 基础扩展集：选择工具 + richtext/mind 创建扩展（embedded 正文选项） */
const baseExtensions = () => [
  createInteractionExtension(),
  createRichTextExtension(),
  createMindExtension(),
];

/** 可控时序的正文绑定：create 返回手动 resolve 的 Promise */
const deferredTextOptions = () => {
  const resolvers: Array<(id: number | null) => void> = [];
  const services = createServiceRegistry(register =>
    register(IWhiteboardRichText, {
      ...createEmbeddedRichTextService(),
      content: {
        create: () =>
          new Promise<number | null>(resolve => {
            resolvers.push(resolve);
          }),
        update: async () => {},
        release: async () => {},
        retain: async () => {},
        unretain: async () => {},
      },
    })
  );
  return { services, resolveNext: (id: number | null) => resolvers.shift()!(id) };
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

const selectElement = (board: Board, element: BoardElement) => {
  board.apply(
    {
      type: "set_selection",
      properties: board.selection,
      newProperties: { selectArea: null, selectedElements: [element] },
    },
    false
  );
};

/** 在 undo 历史中找插入指定类型元素的批次（创建时刻的元素快照，不受组件后续消费影响） */
const findInsertEntry = (board: Board, type: string) => {
  const entry = board.undos.find(ops =>
    ops.some(op => op.type === "insert_node" && (op as { node?: BoardElement }).node?.type === type)
  );
  if (!entry) throw new Error(`未找到 ${type} 的创建撤销步`);
  const insert = entry.find(op => op.type === "insert_node") as Extract<
    Operation,
    { type: "insert_node" }
  >;
  return { entry, insert };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("richtext 创建工具（click 手势）", () => {
  it("点击创建：按下点为左上角、创建批字段与旧 insertRichText 一致（含 autoFocus）、清空选区、单撤销步、工具复位", async () => {
    const seed = geometrySeed("seed", 40, 40);
    const { board, fire, flush, unmount } = await renderClickBoard(baseExtensions(), [seed]);
    selectElement(board, seed);
    expect(board.selection.selectedElements).toHaveLength(1);

    board.setActiveTool(RICHTEXT_TOOL_ID);
    await fire("pointerdown", 120, 80);
    await fire("pointerup", 120, 80);
    await flush();

    expect(board.children).toHaveLength(2);
    expect(board.children[1]).toMatchObject({ type: "richtext", x: 120, y: 80 });
    // 创建批次快照（挂载后 autoFocus 会被 RichText 消费置 false，创建时刻从 undo 历史取）
    const { entry, insert } = findInsertEntry(board, "richtext");
    // 与插入同批的清空选区（旧 onClick 在创建前清空选区）
    expect(entry).toHaveLength(2);
    expect(entry.find(op => op.type === "set_selection")).toBeTruthy();
    const legacy = legacyRichTextElement(120, 80);
    expect({ ...insert.node, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    expect(insert.node.autoFocus).toBe(true);
    // 旧 onClick 不选中新文本（autoFocus 直接进入编辑）
    expect(board.selection.selectedElements).toHaveLength(0);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);

    // 撤销（removeAutoFocus 的消费步 + 创建步）回到创建前
    board.undo();
    board.undo();
    expect(board.children).toHaveLength(1);
    await unmount();
  });

  it("创建模式光标为 cursor-text，复位后清除", async () => {
    const { board, host, unmount } = await renderClickBoard(baseExtensions());
    board.setActiveTool(RICHTEXT_TOOL_ID);
    await act(async () => {});
    expect(host.querySelector(".cursor-text")).toBeTruthy();
    board.setActiveTool(SELECT_TOOL_ID);
    await act(async () => {});
    expect(host.querySelector(".cursor-text")).toBeFalsy();
    await unmount();
  });

  it("异步等待期间再次按下被忽略；完成后照常提交并可继续创建", async () => {
    const deferred = deferredTextOptions();
    const { board, fire, flush, unmount } = await renderClickBoard(
      [createInteractionExtension(), createRichTextExtension()],
      [],
      deferred.services
    );
    board.setActiveTool(RICHTEXT_TOOL_ID);

    await fire("pointerdown", 100, 100);
    await fire("pointerup", 100, 100);
    // 等待正文 content 建好前的重复按下不创建
    await fire("pointerdown", 300, 200);
    await fire("pointerup", 300, 200);
    expect(board.children).toHaveLength(0);

    deferred.resolveNext(701);
    await flush();
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ contentId: 701, x: 100, y: 100 });
    expect(board.activeTool).toBe(SELECT_TOOL_ID);

    // pending 登记已清理：可再次创建
    board.setActiveTool(RICHTEXT_TOOL_ID);
    await fire("pointerdown", 300, 200);
    deferred.resolveNext(702);
    await flush();
    expect(board.children).toHaveLength(2);
    await unmount();
  });

  it("等待期间切换工具 → 丢弃结果不插入", async () => {
    const deferred = deferredTextOptions();
    const { board, fire, flush, unmount } = await renderClickBoard(
      [createInteractionExtension(), createRichTextExtension()],
      [],
      deferred.services
    );
    board.setActiveTool(RICHTEXT_TOOL_ID);
    await fire("pointerdown", 100, 100);
    board.setActiveTool(SELECT_TOOL_ID);

    deferred.resolveNext(701);
    await flush();
    expect(board.children).toHaveLength(0);
    await unmount();
  });

  it("等待期间卸载画布 → 丢弃结果不插入", async () => {
    const deferred = deferredTextOptions();
    const { board, fire, flush, unmount } = await renderClickBoard(
      [createInteractionExtension(), createRichTextExtension()],
      [],
      deferred.services
    );
    board.setActiveTool(RICHTEXT_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointerup", 100, 100);
    await unmount();

    deferred.resolveNext(701);
    await flush();
    expect(board.children).toHaveLength(0);
  });
});

describe("mind 创建工具（click 手势）", () => {
  it("点击创建：按下点为左上角、创建批字段与旧 createMindRoot 一致（含 defaultFocus）、清空选区、单撤销步、工具复位", async () => {
    const seed = geometrySeed("seed", 40, 40);
    const { board, fire, flush, unmount } = await renderClickBoard(baseExtensions(), [seed]);
    selectElement(board, seed);

    board.setActiveTool(MIND_TOOL_ID);
    await fire("pointerdown", 150, 90);
    await fire("pointerup", 150, 90);
    await flush();

    expect(board.children).toHaveLength(2);
    expect(board.children[1]).toMatchObject({ type: "mind-node", x: 150, y: 90 });
    // 旧 onClick 的 [set_selection 清空, insert_node] 单批语义（内核顺序为 insert 在前，终态一致）
    const { entry, insert } = findInsertEntry(board, "mind-node");
    expect(entry).toHaveLength(2);
    expect(entry.find(op => op.type === "set_selection")).toBeTruthy();
    const legacy = legacyMindRoot(150, 90, board.getFontSize());
    expect({ ...insert.node, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    expect((insert.node as MindNodeElement).defaultFocus).toBe(true);
    // 旧 onClick 插入与清空选区同批，不选中新节点
    expect(board.selection.selectedElements).toHaveLength(0);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(board.children).toHaveLength(1);
    // 等 defaultFocus 的 100ms 消费定时器跑完再卸载，避免 teardown 后触发聚焦
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });
    await unmount();
  });

  it("buildMindRootElement 纯函数与旧构造逐字段一致（宽度、层级、折叠、主题默认值）", () => {
    const built = buildMindRootElement(10, 20, 13);
    const legacy = legacyMindRoot(10, 20, 13);
    expect({ ...built, id: undefined, themeId: undefined, themeStyle: undefined }).toStrictEqual({
      ...legacy,
      id: undefined,
      themeId: undefined,
      themeStyle: undefined,
    });
    expect(built.themeId).toEqual(expect.any(String));
  });

  it("创建模式光标为 cursor-crosshair", async () => {
    const { board, host, unmount } = await renderClickBoard(baseExtensions());
    board.setActiveTool(MIND_TOOL_ID);
    await act(async () => {});
    expect(host.querySelector(".cursor-crosshair")).toBeTruthy();
    await unmount();
  });
});

describe("异步创建失败（协议层）", () => {
  it("build reject → 不插入、console.error 中文信息、工具保持", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boomExtension = defineWhiteboardExtension({
      id: "test.boom",
      elements: [
        defineElement({
          type: "test.boom.box",
          render: () => null,
          create: {
            gesture: "click",
            defaultSize: [10, 10],
            build: async () => {
              throw new Error("宿主步骤失败");
            },
          },
        }),
      ],
      create: () => ({
        tools: [
          {
            id: "test.boom.create",
            element: "test.boom.box",
            order: 1,
            group: "drawing",
            label: "测试",
            icon: () => null,
            component: () => null,
          },
        ],
      }),
    });
    const { board, fire, flush, unmount } = await renderClickBoard([
      createInteractionExtension(),
      boomExtension,
    ]);

    board.setActiveTool("test.boom.create");
    await fire("pointerdown", 100, 100);
    await fire("pointerup", 100, 100);
    await flush();

    expect(board.children).toHaveLength(0);
    expect(board.activeTool).toBe("test.boom.create");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("创建元素 test.boom.box 失败"),
      expect.any(Error)
    );
    await unmount();
  });
});

describe("双击空白创建文本（与工具无关，保留入口）", () => {
  it("双击空白处以点击点为左上角插入富文本（含 autoFocus）", async () => {
    const { board, fire, flush, unmount } = await renderClickBoard(baseExtensions());
    await fire("dblclick", 150, 90);
    await flush();

    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ type: "richtext", x: 150, y: 90 });
    // 双击入口与创建手势共用构造：创建时刻字段从 undo 历史取
    const { insert } = findInsertEntry(board, "richtext");
    const legacy = legacyRichTextElement(150, 90);
    expect({ ...insert.node, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    // 双击入口不走创建手势，工具保持选择
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    await unmount();
  });
});

describe("右键菜单入口", () => {
  it("空白处右键菜单激活 text / mind 创建工具", async () => {
    const { board, unmount } = await renderClickBoard(baseExtensions());

    board.getPlugin("richtext")!.getContextMenu!(emptyMenuContext(board))
      .find(item => item.key === "create-text")!
      .onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(RICHTEXT_TOOL_ID);

    board.getPlugin("mind-node")!.getContextMenu!(emptyMenuContext(board))
      .find(item => item.key === "create-mindmap")!
      .onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(MIND_TOOL_ID);
    await unmount();
  });
});
