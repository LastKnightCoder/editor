/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import { SELECT_TOOL_ID } from "../constants/tools";
import {
  defineElement,
  type CreateBuildContext,
  type CustomCreateGesture,
  type StandardSchemaV1,
} from "../extensions";
import {
  defineWhiteboardExtension,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { useBoard } from "../hooks/useBoard";
import type { BoardElement } from "../types";

const okSchema: StandardSchemaV1<unknown, unknown> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: value =>
      (value as { ok?: boolean } | null)?.ok === true
        ? { value }
        : { issues: [{ message: "ok 必须为 true" }] },
  },
};

interface AcmeFixture {
  extension: WhiteboardExtension;
  buildContexts: CreateBuildContext[];
}

/** 第三方测试扩展 acme.test：click / drag / line / custom / plain / bad / versioned / stay */
const createAcmeExtension = (overrides: { stickyAfter?: "select" | "edit" | "none" } = {}) => {
  const buildContexts: CreateBuildContext[] = [];
  const record = (ctx: CreateBuildContext) => {
    buildContexts.push(ctx);
    return ctx;
  };
  /** 构造不带 id 的待插入元素（覆盖“缺 id 由内核补 uuid”的规范化路径） */
  const rectElement = (type: string, ctx: CreateBuildContext, data: unknown = {}) =>
    ({
      type,
      x: ctx.rect.x,
      y: ctx.rect.y,
      width: ctx.rect.width,
      height: ctx.rect.height,
      data,
    }) as unknown as BoardElement;
  const RectRender = ({ element }: { element: BoardElement }) => (
    <rect
      data-acme-element={element.type}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
    />
  );

  const customGesture: CustomCreateGesture = {
    begin: ctx => ({
      move: moveCtx => {
        ctx.preview(
          {
            type: "acme.custom",
            x: moveCtx.point.x - 50,
            y: moveCtx.point.y - 25,
            width: 100,
            height: 50,
            data: {},
          } as unknown as BoardElement,
          { highlight: ["seed"] }
        );
      },
      end: endCtx => ({
        element: {
          type: "acme.custom",
          x: endCtx.point.x - 50,
          y: endCtx.point.y - 25,
          width: 100,
          height: 50,
          data: {},
        } as unknown as BoardElement,
        operations: [
          { type: "set_node", path: [0], properties: { x: 0 }, newProperties: { x: 480 } },
        ],
      }),
    }),
  };

  const extension = defineWhiteboardExtension({
    id: "acme.test",
    elements: [
      defineElement({
        type: "acme.sticky",
        render: RectRender,
        create: {
          gesture: "click",
          defaultSize: [160, 160],
          after: overrides.stickyAfter ?? "edit",
          build: ctx => rectElement("acme.sticky", record(ctx), { kind: "sticky" }),
        },
      }),
      defineElement({
        type: "acme.card",
        render: RectRender,
        create: {
          gesture: "drag",
          defaultSize: [260, 150],
          minSize: [20, 20],
          build: ctx => rectElement("acme.card", record(ctx)),
        },
      }),
      defineElement({
        type: "acme.line",
        render: RectRender,
        create: {
          gesture: "drag",
          constrain: "line",
          build: ctx => rectElement("acme.line", record(ctx), { start: ctx.start, end: ctx.end }),
        },
      }),
      defineElement({
        type: "acme.custom",
        render: RectRender,
        create: { gesture: customGesture },
      }),
      defineElement({
        type: "acme.plain",
        render: RectRender,
        create: {
          gesture: "drag",
          build: ctx => rectElement("acme.plain", record(ctx)),
        },
      }),
      defineElement({
        type: "acme.bad",
        render: RectRender,
        schema: okSchema,
        create: {
          gesture: "drag",
          build: ctx => rectElement("acme.bad", record(ctx), { ok: false }),
        },
      }),
      defineElement({
        type: "acme.versioned",
        render: RectRender,
        schemaVersion: 2,
        migrate: { 1: element => ({ ...element }) },
        create: {
          gesture: "click",
          defaultSize: [40, 40],
          build: ctx => rectElement("acme.versioned", record(ctx)),
        },
      }),
      defineElement({
        type: "acme.stay",
        render: RectRender,
        create: {
          gesture: "click",
          defaultSize: [50, 50],
          stay: true,
          after: "none",
          build: ctx => rectElement("acme.stay", record(ctx)),
        },
      }),
    ],
    create: () => ({
      tools: [
        ["acme.sticky.create", "acme.sticky"],
        ["acme.card.create", "acme.card"],
        ["acme.line.create", "acme.line"],
        ["acme.custom.create", "acme.custom"],
        ["acme.plain.create", "acme.plain"],
        ["acme.bad.create", "acme.bad"],
        ["acme.versioned.create", "acme.versioned"],
        ["acme.stay.create", "acme.stay"],
      ].map(([id, element], index) => ({
        id,
        element,
        order: index,
        group: "acme",
        label: "测试工具",
        icon: () => null,
        component: () => null,
      })),
    }),
  });
  return { extension, buildContexts } satisfies AcmeFixture;
};

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
  press: (key: string, modifiers?: { shiftKey?: boolean; altKey?: boolean }) => Promise<void>;
  unmount: () => Promise<void>;
}

const renderWhiteBoard = async (
  extension: WhiteboardExtension,
  options: { initData?: BoardElement[]; onChange?: (snapshot: unknown) => void } = {}
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
  const extensions = [
    extension,
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
        initData={options.initData ?? []}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
        onChange={options.onChange}
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
  const press = async (key: string, modifiers?: { shiftKey?: boolean; altKey?: boolean }) => {
    await act(async () => {
      (document.activeElement ?? document).dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key,
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
    press,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("创建型工具装配校验", () => {
  it("command 与 element 必须恰好提供一个（两者都有 / 都没有均被拒）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: WhiteboardExtensionError[] = [];
    const board = new Board(
      [],
      { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      {
        selectedElements: [],
        selectArea: null,
      }
    );
    board.installExtensions(
      [
        defineWhiteboardExtension({
          id: "acme.both",
          elements: [
            {
              type: "acme.both.box",
              render: () => null,
              create: { gesture: "click", defaultSize: [10, 10], build: () => null },
            },
          ],
          create: () => ({
            commands: [{ id: "acme.both.run", execute: () => {} }],
            tools: [
              {
                id: "acme.both.create",
                command: "acme.both.run",
                element: "acme.both.box",
                order: 0,
                group: "g",
                label: "测试",
                icon: () => null,
                component: () => null,
              },
            ],
          }),
        }),
        defineWhiteboardExtension({
          id: "acme.none",
          create: () => ({
            tools: [
              {
                id: "acme.none.create",
                order: 0,
                group: "g",
                label: "测试",
                icon: () => null,
                component: () => null,
              },
            ],
          }),
        }),
      ],
      error => errors.push(error)
    );
    board.destroy();
    expect(errors.map(error => error.reason)).toEqual(["invalid-definition", "invalid-definition"]);
    expect(errors[0].message).toContain("恰好提供一个");
  });

  it("element 指向无 create 的类型 / 指向别的扩展的类型 / click 缺 defaultSize 均被拒", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: WhiteboardExtensionError[] = [];
    const board = new Board(
      [],
      { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      {
        selectedElements: [],
        selectArea: null,
      }
    );
    const { extension: acme } = createAcmeExtension();
    board.installExtensions(
      [
        acme,
        defineWhiteboardExtension({
          id: "acme.nocreate",
          elements: [{ type: "acme.nocreate.box", render: () => null }],
          create: () => ({
            tools: [
              {
                id: "acme.nocreate.create",
                element: "acme.nocreate.box",
                order: 0,
                group: "g",
                label: "测试",
                icon: () => null,
                component: () => null,
              },
            ],
          }),
        }),
        defineWhiteboardExtension({
          id: "acme.foreign",
          create: () => ({
            tools: [
              {
                id: "acme.foreign.create",
                element: "acme.card",
                order: 0,
                group: "g",
                label: "测试",
                icon: () => null,
                component: () => null,
              },
            ],
          }),
        }),
        defineWhiteboardExtension({
          id: "acme.nosize",
          elements: [
            {
              type: "acme.nosize.dot",
              render: () => null,
              create: { gesture: "click", build: () => null },
            },
          ],
          create: () => ({
            tools: [
              {
                id: "acme.nosize.create",
                element: "acme.nosize.dot",
                order: 0,
                group: "g",
                label: "测试",
                icon: () => null,
                component: () => null,
              },
            ],
          }),
        }),
      ],
      error => errors.push(error)
    );
    board.destroy();
    expect(errors.map(error => error.reason)).toEqual([
      "invalid-definition",
      "invalid-definition",
      "invalid-definition",
    ]);
    expect(errors[0].message).toContain("未声明 create");
    expect(errors[1].message).toContain("不是本扩展声明的元素类型");
    expect(errors[2].message).toContain("defaultSize");
  });
});

describe("创建型工具激活", () => {
  it("runTool 激活工具，再次点击切回选择，readonly 下不能激活", async () => {
    const { extension } = createAcmeExtension();
    const { board, unmount } = await renderWhiteBoard(extension);
    const tool = board.extensions!.tools.find(item => item.id === "acme.card.create")!;

    board.extensions!.runTool(tool);
    expect(board.activeTool).toBe("acme.card.create");
    expect(board.isCreating()).toBe(true);

    board.extensions!.runTool(tool);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);

    board.readonly = true;
    board.extensions!.runTool(tool);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.setActiveTool("acme.card.create")).toBe(false);
    board.readonly = false;

    await unmount();
  });
});

describe("click 手势", () => {
  it("点击即插入以点击点为中心的 defaultSize 元素，一次 onChange、一步撤销、工具复位并选中", async () => {
    const onChange = vi.fn();
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension, { onChange });
    board.setActiveTool("acme.sticky.create");

    await fire("pointerdown", 300, 200);
    // click 手势在按下时立即提交
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({
      type: "acme.sticky",
      x: 220,
      y: 120,
      width: 160,
      height: 160,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await fire("pointerup", 300, 200);

    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.selection.selectedElements.map(element => element.id)).toEqual([
      board.children[0].id,
    ]);
    expect(board.undos).toHaveLength(1);
    board.undo();
    expect(board.children).toHaveLength(0);
    await unmount();
  });

  it("stay:true 创建后保持工具", async () => {
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.stay.create");

    await fire("pointerdown", 100, 100);
    await fire("pointerup", 100, 100);
    expect(board.children).toHaveLength(1);
    expect(board.activeTool).toBe("acme.stay.create");
    await unmount();
  });

  it("缺 id 时补 uuid，定义 schemaVersion>1 时补版本号", async () => {
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.versioned.create");

    await fire("pointerdown", 50, 50);
    await fire("pointerup", 50, 50);
    const created = board.children[0];
    expect(created.id).toBeTruthy();
    expect(created.schemaVersion).toBe(2);
    await unmount();
  });
});

describe("drag 手势", () => {
  it("拖动过程中文档与快照不变，松手一次插入且只有一个撤销步", async () => {
    const onChange = vi.fn();
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension, { onChange });
    board.setActiveTool("acme.card.create");

    const snapshotBefore = board.getSnapshot();
    const childrenBefore = board.children;
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160);
    expect(board.children).toBe(childrenBefore);
    expect(board.getSnapshot()).toBe(snapshotBefore);
    expect(onChange).not.toHaveBeenCalled();
    expect(board.creationPreview).not.toBeNull();
    expect(board.creationPreview!.element).toMatchObject({ type: "acme.card" });

    await fire("pointerup", 200, 160);
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({
      type: "acme.card",
      x: 100,
      y: 100,
      width: 100,
      height: 60,
    });
    expect(board.undos).toHaveLength(1);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    board.undo();
    expect(board.children).toHaveLength(0);
    await unmount();
  });

  it("Shift 等比、Alt 以按下点为中心", async () => {
    const { extension, buildContexts } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);

    board.setActiveTool("acme.card.create");
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160, { shiftKey: true });
    await fire("pointerup", 200, 160, { shiftKey: true });
    expect(board.children[0]).toMatchObject({ x: 100, y: 100, width: 100, height: 100 });

    buildContexts.length = 0;
    board.setActiveTool("acme.card.create");
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 150, 130, { altKey: true });
    await fire("pointerup", 150, 130, { altKey: true });
    expect(board.children[1]).toMatchObject({ x: 50, y: 70, width: 100, height: 60 });
    await unmount();
  });

  it("未超过 4 屏幕像素视为单击，按 defaultSize 居中创建", async () => {
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.card.create");

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 103, 100);
    await fire("pointerup", 103, 100);
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ x: -30, y: 25, width: 260, height: 150 });
    await unmount();
  });

  it("无 defaultSize 的 drag 单击不创建且工具保持；小于 minSize 不创建", async () => {
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);

    board.setActiveTool("acme.plain.create");
    await fire("pointerdown", 100, 100);
    await fire("pointerup", 102, 100);
    expect(board.children).toHaveLength(0);
    expect(board.activeTool).toBe("acme.plain.create");

    board.setActiveTool("acme.card.create");
    await fire("pointerdown", 100, 100);
    await fire("pointermove", 110, 105);
    await fire("pointerup", 110, 105);
    expect(board.children).toHaveLength(0);
    expect(board.activeTool).toBe("acme.card.create");
    await unmount();
  });

  it("line 约束：Shift 时 end 吸附到 45° 方向且长度不变", async () => {
    const { extension, buildContexts } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.line.create");

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 190, { shiftKey: true });
    await fire("pointerup", 200, 190, { shiftKey: true });

    const ctx = buildContexts.at(-1)!;
    const length = Math.hypot(100, 90);
    expect(ctx.start).toEqual({ x: 100, y: 100 });
    expect(ctx.end.x - 100).toBeCloseTo(length / Math.SQRT2, 6);
    expect(ctx.end.y - 100).toBeCloseTo(length / Math.SQRT2, 6);
    expect(Math.hypot(ctx.end.x - ctx.start.x, ctx.end.y - ctx.start.y)).toBeCloseTo(length, 6);
    expect(board.children[0].width).toBeCloseTo(length / Math.SQRT2, 6);
    await unmount();
  });

  it("拖动中按 Shift（keydown）立即以最后指针位置重算预览", async () => {
    const { extension } = createAcmeExtension();
    const { board, fire, press, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.card.create");

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160);
    expect(board.creationPreview!.element).toMatchObject({ width: 100, height: 60 });

    await press("Shift", { shiftKey: true });
    expect(board.creationPreview!.element).toMatchObject({ width: 100, height: 100 });
    await unmount();
  });
});

describe("取消与中断", () => {
  it("拖动中 Esc 取消：无插入、工具保持、预览 120ms 后移除，再按 Esc 退出工具", async () => {
    vi.useFakeTimers();
    const { extension } = createAcmeExtension();
    const { board, host, fire, press, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.card.create");

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160);
    expect(host.querySelector("[data-creation-preview-bounds]")).not.toBeNull();

    await press("Escape");
    expect(board.children).toHaveLength(0);
    expect(board.activeTool).toBe("acme.card.create");
    expect(board.creationPreview).not.toBeNull();
    expect(board.creationPreview!.leaving).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(board.creationPreview).toBeNull();
    expect(host.querySelector("[data-creation-preview-bounds]")).toBeNull();

    await press("Escape");
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    await unmount();
  });

  it("创建模式接管后 SelectingState/DraggingState 不启动，插件 onPointerDown 不广播", async () => {
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);
    const spy = vi.fn();
    board.initPlugins([{ name: "test.spy", onPointerDown: spy }]);

    board.setActiveTool("acme.card.create");
    await fire("pointerdown", 400, 300);
    expect(board.interactions.activePointerState?.name).toBe("creating");
    expect(spy).not.toHaveBeenCalled();
    await fire("pointerup", 400, 300);

    board.setActiveTool(SELECT_TOOL_ID);
    await fire("pointerdown", 400, 300);
    expect(spy).toHaveBeenCalled();
    await fire("pointerup", 400, 300);
    await unmount();
  });
});

describe("自定义手势与附加操作", () => {
  it("custom：highlight 进入预览，operations 与插入同属一个撤销步", async () => {
    const onChange = vi.fn();
    const seed: BoardElement = {
      id: "seed",
      type: "acme.card",
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      data: {},
    };
    const { extension } = createAcmeExtension();
    const { board, host, fire, unmount } = await renderWhiteBoard(extension, {
      initData: [seed],
      onChange,
    });
    board.setActiveTool("acme.custom.create");

    await fire("pointerdown", 200, 200);
    await fire("pointermove", 260, 240);
    expect(board.creationPreview!.highlight).toEqual(["seed"]);
    expect(board.creationPreview!.element.type).toBe("acme.custom");
    expect(
      host.querySelector('[stroke="var(--tau-accent-soft)"][data-creation-preview-bounds]') ??
        host.querySelector('[stroke="var(--tau-accent-soft)"]')
    ).not.toBeNull();

    await fire("pointerup", 260, 240);
    expect(board.children).toHaveLength(2);
    const created = board.children.find(element => element.type === "acme.custom")!;
    expect(created).toMatchObject({ x: 210, y: 215, width: 100, height: 50 });
    expect(board.children.find(element => element.id === "seed")!.x).toBe(480);
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(board.children).toHaveLength(1);
    expect(board.children[0].id).toBe("seed");
    expect(board.children[0].x).toBe(0);
    await unmount();
  });
});

describe("校验失败", () => {
  it("build 产出不合规 data：不插入、console.error 中文信息、工具保持", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { extension } = createAcmeExtension();
    const { board, fire, unmount } = await renderWhiteBoard(extension);
    board.setActiveTool("acme.bad.create");

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160);
    await fire("pointerup", 200, 160);
    expect(board.children).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.some(call => String(call[0]).includes("acme.bad"))).toBe(true);
    expect(board.activeTool).toBe("acme.bad.create");
    await unmount();
  });
});

describe("预览渲染", () => {
  it("拖动时出现描边 rect 与尺寸徽标，激活创建工具时容器带 crosshair 光标", async () => {
    const { extension } = createAcmeExtension();
    const { board, host, fire, unmount } = await renderWhiteBoard(extension);

    const container = host.querySelector("[data-whiteboard-root]")!;
    expect(container.classList.contains("cursor-crosshair")).toBe(false);

    await act(async () => {
      board.setActiveTool("acme.card.create");
    });
    expect(container.classList.contains("cursor-crosshair")).toBe(true);

    await fire("pointerdown", 100, 100);
    await fire("pointermove", 200, 160);
    const boundsRect = host.querySelector("[data-creation-preview-bounds]")!;
    expect(boundsRect.getAttribute("stroke")).toBe("var(--tau-accent-text)");
    const badge = host.querySelector("[data-creation-preview-badge]")!;
    expect(badge.textContent).toBe("100 × 60");
    expect(host.querySelector("[data-acme-element='acme.card']")).not.toBeNull();

    await fire("pointerup", 200, 160);
    expect(host.querySelector("[data-creation-preview-bounds]")).toBeNull();
    expect(host.querySelector("[data-creation-preview-badge]")).toBeNull();
    await act(async () => {
      board.setActiveTool(SELECT_TOOL_ID);
    });
    expect(container.classList.contains("cursor-crosshair")).toBe(false);
    await unmount();
  });
});
