/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../Board";
import { BOARD_TO_CONTAINER } from "../constants/map";
import { SELECT_TOOL_ID } from "../constants/tools";
import { defineWhiteboardExtension, type WhiteboardExtension } from "../extensions/api";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";
import { SelectingState } from "../interactions/states/SelectingState";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const boards: Board[] = [];
const create = () => {
  const board = new Board([], viewport, { selectedElements: [], selectArea: null });
  boards.push(board);
  return board;
};
const mountContainer = (board: Board) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ x: 30, y: 40, left: 30, top: 40, width: 800, height: 600 }),
  });
  BOARD_TO_CONTAINER.set(board, container);
  return container;
};
const pointerDown = (x = 10, y = 10) =>
  new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  }) as unknown as PointerEvent;

afterEach(() => {
  boards.splice(0).forEach(board => {
    BOARD_TO_CONTAINER.delete(board);
    board.destroy();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("activeTool 模型", () => {
  it("默认激活选择工具且不处于创建模式", () => {
    const board = create();
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.isCreating()).toBe(false);
    expect(board.activeToolOptions).toBeNull();
  });

  it("工具切换携带参数并只触发一次事件", () => {
    const board = create();
    const toolChanges = vi.fn();
    board.on("active-tool:change", toolChanges);

    expect(board.setActiveTool("tau.geometry.create", { geometryType: "rect" })).toBe(true);
    expect(board.activeTool).toBe("tau.geometry.create");
    expect(board.activeToolOptions).toEqual({ geometryType: "rect" });
    expect(board.isCreating()).toBe(true);

    board.setActiveTool("tau.frame.create");
    expect(board.activeTool).toBe("tau.frame.create");
    expect(board.activeToolOptions).toBeNull();

    board.setActiveTool(SELECT_TOOL_ID);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.isCreating()).toBe(false);

    expect(toolChanges).toHaveBeenCalledTimes(3);
  });

  it("未注册工具 id 抛中文错误；只读画布下非 select 设置被忽略", () => {
    const board = create();
    expect(() => board.setActiveTool("acme.unknown.create")).toThrow("未注册的白板工具");
    board.readonly = true;
    expect(board.setActiveTool("tau.geometry.create")).toBe(false);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.setActiveTool(SELECT_TOOL_ID)).toBe(true);
    board.readonly = false;
  });

  it("第三方扩展注册的工具可激活且让位框选手势", () => {
    const board = create();
    mountContainer(board);
    board.installExtensions([
      defineWhiteboardExtension({
        id: "acme.sticky",
        create: () => ({
          tools: [
            {
              id: "acme.sticky.create",
              command: "acme.sticky.create",
              order: 10,
              group: "drawing",
              label: "便签",
              icon: () => null,
              component: () => null,
            },
          ],
          commands: [{ id: "acme.sticky.create", execute: () => {} }],
        }),
      }),
    ]);

    expect(board.setActiveTool("acme.sticky.create")).toBe(true);
    expect(board.isCreating()).toBe(true);
    expect(SelectingState.tryStart(board, pointerDown())).toBeNull();

    board.setActiveTool(SELECT_TOOL_ID);
    expect(SelectingState.tryStart(board, pointerDown())).not.toBeNull();
  });

  it("screenToCanvas 与 canvasToScreen 在缩放平移视口下互逆", () => {
    const board = create();
    board.installExtensions([]);
    mountContainer(board);
    const api = board.extensions!.api;
    board.apply(
      {
        type: "set_viewport",
        properties: { minX: 0, minY: 0 },
        newProperties: { minX: 120, minY: -80, zoom: 1.75 },
      },
      false
    );

    const screen = { x: 333.5, y: 222.25 };
    const canvas = api.screenToCanvas(screen);
    const restored = api.canvasToScreen(canvas);
    expect(Math.abs(restored.x - screen.x)).toBeLessThan(1e-6);
    expect(Math.abs(restored.y - screen.y)).toBeLessThan(1e-6);

    BOARD_TO_CONTAINER.delete(board);
    expect(() => api.screenToCanvas(screen)).toThrow("白板容器尚未挂载");
    expect(() => api.canvasToScreen(canvas)).toThrow("白板容器尚未挂载");
  });

  it("Esc 退出创建模式；输入法组合与编辑上下文让位", () => {
    const board = create();
    board.setActiveTool("tau.geometry.create");

    const composing = new KeyboardEvent("keydown", { key: "Escape" });
    Object.defineProperty(composing, "isComposing", { value: true });
    board.onKeyDown(composing);
    expect(board.isCreating()).toBe(true);

    const inInput = new KeyboardEvent("keydown", { key: "Escape" });
    Object.defineProperty(inInput, "target", { value: document.createElement("input") });
    board.onKeyDown(inInput);
    expect(board.isCreating()).toBe(true);

    board.isEditingElements = ["editing"];
    board.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(board.isCreating()).toBe(true);

    board.isEditingElements = [];
    board.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.isCreating()).toBe(false);
  });

  it("onActiveToolChange 随画布卸载与扩展禁用清理", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boardListener = vi.fn();
    const rejectedListener = vi.fn();
    const board = create();
    board.installExtensions([
      defineWhiteboardExtension({
        id: "test.watcher",
        create: api => {
          api.onActiveToolChange(boardListener);
          return {};
        },
      }),
      defineWhiteboardExtension({
        id: "test.failed",
        create: api => {
          api.onActiveToolChange(rejectedListener);
          throw new Error("安装失败");
        },
      }),
    ]);

    board.setActiveTool("tau.frame.create");
    expect(boardListener).toHaveBeenCalledTimes(1);
    expect(rejectedListener).not.toHaveBeenCalled();

    board.destroy();
    board.setActiveTool("tau.column.create");
    expect(boardListener).toHaveBeenCalledTimes(1);
  });

  it("扩展展示名可查询，内置选择工具注册在工具列表最前", async () => {
    const board = create();
    board.installExtensions([
      ...createStandardWhiteboardExtensions(),
      defineWhiteboardExtension({ id: "test.named", name: "测试扩展", create: () => ({}) }),
    ]);
    const runtime = board.extensions!;

    expect(runtime.getExtensionName("test.named")).toBe("测试扩展");
    expect(runtime.getExtensionName("test.missing")).toBeUndefined();
    expect(runtime.getExtensionName("tau.interaction")).toBeUndefined();

    expect(runtime.tools[0]).toMatchObject({ id: SELECT_TOOL_ID, group: "base", order: 0 });
    board.setActiveTool("tau.geometry.create");
    await runtime.execute("tau.select");
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(runtime.api.activeTool).toBe(SELECT_TOOL_ID);
  });
});
