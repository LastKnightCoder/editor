import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Board from "../Board";
import type { BoardElement } from "../types";
import {
  defineWhiteboardExtension,
  type WhiteboardElementDefinition,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { CopyPastePlugin } from "../plugins/CopyPastePlugin";
import { buildClipboardPayload } from "../utils/ClipboardUtil";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };

const element = (
  overrides: Partial<BoardElement> & { id: string; type: string }
): BoardElement => ({
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  ...overrides,
});

const definition = (overrides: Partial<WhiteboardElementDefinition> & { type: string }) => ({
  render: () => <g data-definition-render />,
  ...overrides,
});

const boards: Board[] = [];
const createBoard = (children: BoardElement[] = []) => {
  const board = new Board(children, viewport, { selectedElements: [], selectArea: null });
  boards.push(board);
  return board;
};
const install = (board: Board, extensions: readonly WhiteboardExtension[]) => {
  const errors: WhiteboardExtensionError[] = [];
  board.installExtensions(extensions, error => errors.push(error));
  return errors;
};

afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
});

describe("元素定义版本装配校验", () => {
  it("同版本声明直接装配，不要求升级函数", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.cards",
        elements: [definition({ type: "acme.card", schemaVersion: 2 })],
        create: () => ({}),
      }),
    ]);
    expect(errors).toEqual([]);
    expect(board.getPlugin("acme.card")).toBeDefined();
  });

  it("schemaVersion=0 → invalid-definition", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.cards",
        elements: [definition({ type: "acme.card", schemaVersion: 0 })],
        create: () => ({}),
      }),
    ]);
    expect(errors).toMatchObject([{ extensionId: "acme.cards", reason: "invalid-definition" }]);
    expect(board.getPlugin("acme.card")).toBeUndefined();
  });

  it("schemaVersion 缺省或 1 时正常装配", () => {
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.cards",
        elements: [definition({ type: "acme.card" })],
        create: () => ({}),
      }),
    ]);
    expect(errors).toEqual([]);
    expect(board.getPlugin("acme.card")).toBeDefined();
  });
});

const cardExtension = (options: {
  schemaVersion: number;
  render?: WhiteboardElementDefinition["render"];
}) =>
  defineWhiteboardExtension({
    id: "acme.cards",
    elements: [
      definition({
        type: "acme.card",
        schemaVersion: options.schemaVersion,
        ...(options.render ? { render: options.render } : {}),
      }),
    ],
    create: () => ({}),
  });

describe("加载迁移", () => {
  it("加载含 v1 元素的数据并安装 v2 扩展：快照仍为 v1，不 emit change，undo 栈为空", () => {
    const changeSpy = vi.fn();
    const valueChangeSpy = vi.fn();
    const source = element({
      id: "c1",
      type: "acme.card",
      schemaVersion: 1,
      data: { text: "旧数据" },
    });
    const board = createBoard([source]);
    board.on("change", changeSpy);
    board.on("value:change", valueChangeSpy);

    const errors = install(board, [
      cardExtension({
        schemaVersion: 2,
      }),
    ]);
    expect(errors).toEqual([]);
    expect(board.getSnapshot().children[0]).toMatchObject({
      id: "c1",
      schemaVersion: 1,
      data: { text: "旧数据" },
    });
    expect(changeSpy).not.toHaveBeenCalled();
    expect(valueChangeSpy).not.toHaveBeenCalled();
    expect(board.undos).toHaveLength(0);
    expect(board.redos).toHaveLength(0);
  });

  it("扩展未安装或类型未定义时不迁移", () => {
    const source = element({ id: "c1", type: "acme.card", schemaVersion: 1 });
    const board = createBoard([source]);
    install(board, []);
    expect(board.getSnapshot().children[0]).toBe(source);
  });
});

describe("插入迁移（submit / undo / redo）", () => {
  const v2Extension = () =>
    cardExtension({
      schemaVersion: 2,
    });

  it("api.submit 插入 v1 元素 → 快照中仍为 v1，undo/redo 正确", () => {
    const board = createBoard();
    install(board, [v2Extension()]);
    const api = board.extensions!.api;
    api.submit([
      {
        type: "insert_node",
        path: [0],
        node: element({ id: "fresh", type: "acme.card", schemaVersion: 1, data: "v1" }),
      },
    ]);
    expect(api.getSnapshot().children[0]).toMatchObject({
      id: "fresh",
      schemaVersion: 1,
      data: "v1",
    });

    board.undo();
    expect(board.children).toHaveLength(0);
    board.redo();
    // 撤销恢复原始载荷，不执行加载期转换。
    expect(board.children[0]).toMatchObject({ id: "fresh", schemaVersion: 1, data: "v1" });
  });

  it("粘贴 v1 元素 → 原样保留 v1", () => {
    const board = createBoard();
    install(board, [v2Extension()]);
    const payload = buildClipboardPayload(board, [
      element({ id: "copied", type: "acme.card", schemaVersion: 1, data: "v1" }),
    ])!;

    const plugin = new CopyPastePlugin();
    const event = new Event("paste", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [],
        getData: (type: string) =>
          type === "application/json" || type === "text/plain" ? payload : "",
      },
    });
    plugin.onPaste(event, board);

    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ schemaVersion: 1, data: "v1", x: 30, y: 40 });
  });

  it("删除 v2 元素后 undo 恢复的仍是 v2", () => {
    const board = createBoard([
      element({ id: "c1", type: "acme.card", schemaVersion: 2, data: "v2" }),
    ]);
    install(board, [v2Extension()]);
    expect(board.children[0]).toMatchObject({ schemaVersion: 2 });

    board.apply({ type: "remove_node", path: [0], node: board.children[0] });
    expect(board.children).toHaveLength(0);
    board.undo();
    expect(board.children[0]).toMatchObject({ id: "c1", schemaVersion: 2, data: "v2" });
  });
});

describe("不兼容元素按占位渲染", () => {
  const renderElement = (board: Board, target: BoardElement) =>
    renderToStaticMarkup(<svg>{board.renderElement(target)}</svg>);

  it("v3 数据配 v2 扩展：too-new 占位，作者 render 未被调用，数据不变，移动只改 x/y", () => {
    const authorRender = vi.fn(() => <g data-acme-card />);
    const source = element({ id: "t1", type: "acme.card", schemaVersion: 3, data: "future" });
    const board = createBoard([source]);
    install(board, [
      cardExtension({
        schemaVersion: 2,
        render: authorRender,
      }),
    ]);

    const html = renderElement(board, board.children[0]);
    expect(html).toContain('data-unknown-reason="too-new"');
    expect(html).not.toContain("data-definition-render");
    expect(authorRender).not.toHaveBeenCalled();
    // 数据原样保留
    expect(board.children[0]).toEqual(source);

    const moved = board.moveElement(board.children[0], 15, -5);
    expect(moved).toEqual({ ...source, x: 25, y: 15 });
    expect(board.children[0]).toEqual(source);
  });

  it("版本不匹配停在旧版本：unsupported-version 占位", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const source = element({ id: "m1", type: "acme.card", schemaVersion: 1, data: "v1" });
    const board = createBoard([source]);
    install(board, [
      cardExtension({
        schemaVersion: 2,
      }),
    ]);
    const html = renderElement(board, board.children[0]);
    expect(html).toContain('data-unknown-reason="unsupported-version"');
    expect(board.children[0]).toEqual(source);
  });

  it("被拒扩展声明的元素：disabled；完全未知 type：missing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard([
      element({ id: "d1", type: "acme.orphan" }),
      element({ id: "x1", type: "who.unknown" }),
    ]);
    install(board, [
      defineWhiteboardExtension({
        id: "acme.dangling",
        elements: [definition({ type: "acme.orphan" })],
        create: () => ({
          tools: [
            {
              id: "acme.dangling.tool",
              command: "acme.missing.run",
              order: 1,
              group: "acme",
              label: "测试",
              icon: () => null,
              component: () => null,
            },
          ],
        }),
      }),
    ]);
    const disabledHtml = renderElement(board, board.children[0]);
    expect(disabledHtml).toContain('data-unknown-element="d1"');
    expect(disabledHtml).toContain('data-unknown-reason="disabled"');

    const missingHtml = renderElement(board, board.children[1]);
    expect(missingHtml).toContain('data-unknown-element="x1"');
    expect(missingHtml).toContain('data-unknown-reason="missing"');
  });
});

describe("版本不匹配报告", () => {
  it("加载与插入不执行旧迁移函数", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard([
      element({ id: "a", type: "acme.card", schemaVersion: 1 }),
      element({ id: "b", type: "acme.card", schemaVersion: 1 }),
    ]);
    const errors = install(board, [
      cardExtension({
        schemaVersion: 2,
      }),
    ]);
    expect(errors).toHaveLength(0);

    // 插入路径的失败不再重复报告
    board.apply({
      type: "insert_node",
      path: [0],
      node: element({ id: "c", type: "acme.card", schemaVersion: 1 }),
    });
    expect(errors).toHaveLength(0);
    // 扩展的其它贡献不受影响
    expect(board.getPlugin("acme.card")).toBeDefined();
  });
});
