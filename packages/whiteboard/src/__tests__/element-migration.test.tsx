import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Board from "../Board";
import type { BoardElement } from "../types";
import { migrateElementTree } from "../extensions/migration";
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

describe("migrateElementTree 纯函数", () => {
  const v3Definition = definition({
    type: "acme.card",
    schemaVersion: 3,
    migrate: {
      1: e => ({ ...e, data: `v2:${e.data}` }),
      2: e => ({ ...e, data: `v3:${e.data}` }),
    },
  });
  const table = new Map([[v3Definition.type, v3Definition]]);

  it("v1 → v3 依次调用两步，最终 schemaVersion=3", () => {
    const migrate1 = vi.fn(e => ({ ...e, data: `v2:${e.data}` }));
    const migrate2 = vi.fn(e => ({ ...e, data: `v3:${e.data}` }));
    const def = definition({
      type: "acme.card",
      schemaVersion: 3,
      migrate: { 1: migrate1, 2: migrate2 },
    });
    const source = element({ id: "c1", type: "acme.card", schemaVersion: 1, data: "x" });
    const { children, changed, failures } = migrateElementTree(
      [source],
      new Map([[def.type, def]])
    );

    expect(changed).toBe(true);
    expect(failures).toEqual([]);
    expect(children[0]).toMatchObject({ id: "c1", type: "acme.card", schemaVersion: 3 });
    expect(migrate1).toHaveBeenCalledTimes(1);
    expect(migrate2).toHaveBeenCalledTimes(1);
    // 第一步收到 v1 数据，第二步收到第一步结果且已被标为 v2
    expect(migrate1.mock.calls[0][0]).toMatchObject({ schemaVersion: 1, data: "x" });
    expect(migrate2.mock.calls[0][0]).toMatchObject({ schemaVersion: 2, data: "v2:x" });
    expect(children[0].data).toBe("v3:v2:x");
  });

  it("迁移步骤收到的是不含 children 的深拷贝，子树由运行时最后重新挂上", () => {
    const migrate1 = vi.fn((e: BoardElement) => ({ ...e, data: "up" }));
    const def = definition({ type: "acme.card", schemaVersion: 2, migrate: { 1: migrate1 } });
    const child = element({ id: "child", type: "acme.card", schemaVersion: 1, data: "c" });
    const source = element({
      id: "p1",
      type: "acme.card",
      schemaVersion: 1,
      data: "p",
      children: [child],
    });
    const { children } = migrateElementTree([source], new Map([[def.type, def]]));

    expect("children" in migrate1.mock.calls[0][0]).toBe(false);
    // 迁移函数改写入参不影响文档数据（深拷贝隔离）
    expect(source.data).toBe("p");
    expect(children[0]).toMatchObject({ schemaVersion: 2, data: "up" });
    expect(children[0]!.children![0]).toMatchObject({ id: "child", schemaVersion: 2, data: "up" });
  });

  it("嵌套子树各自按定义迁移", () => {
    const card = definition({
      type: "acme.card",
      schemaVersion: 2,
      migrate: { 1: e => ({ ...e, data: "card" }) },
    });
    const box = definition({
      type: "acme.box",
      schemaVersion: 2,
      migrate: { 1: e => ({ ...e, data: "box" }) },
    });
    const tree = [
      element({
        id: "b1",
        type: "acme.box",
        schemaVersion: 1,
        children: [
          element({ id: "c1", type: "acme.card", schemaVersion: 1 }),
          element({
            id: "c2",
            type: "acme.card",
            schemaVersion: 1,
            children: [element({ id: "c3", type: "acme.card", schemaVersion: 1 })],
          }),
        ],
      }),
    ];
    const { children, failures } = migrateElementTree(
      tree,
      new Map([
        [card.type, card],
        [box.type, box],
      ])
    );
    expect(failures).toEqual([]);
    expect(children[0]).toMatchObject({ schemaVersion: 2, data: "box" });
    expect(children[0]!.children![0]).toMatchObject({ schemaVersion: 2, data: "card" });
    expect(children[0]!.children![1]!.children![0]).toMatchObject({
      schemaVersion: 2,
      data: "card",
    });
  });

  it("未知 type 原样、v≥当前原样、无变化时返回原数组引用", () => {
    const unknown = element({ id: "u1", type: "who.unknown", schemaVersion: 1 });
    const sameVersion = element({ id: "s1", type: "acme.card", schemaVersion: 3 });
    const newer = element({ id: "n1", type: "acme.card", schemaVersion: 5 });
    const source = [unknown, sameVersion, newer];
    const result = migrateElementTree(source, table);
    expect(result.changed).toBe(false);
    expect(result.children).toBe(source);
    expect(result.children[0]).toBe(unknown);
  });

  it("某步抛错：元素自身保持原字段原版本，子树仍迁移，失败被记录", () => {
    const broken = definition({
      type: "acme.card",
      schemaVersion: 2,
      migrate: {
        1: () => {
          throw new Error("迁移崩溃");
        },
      },
    });
    const working = definition({
      type: "acme.leaf",
      schemaVersion: 2,
      migrate: { 1: e => ({ ...e, data: "leaf" }) },
    });
    const child = element({ id: "child", type: "acme.leaf", schemaVersion: 1, data: "c" });
    const source = element({
      id: "p1",
      type: "acme.card",
      schemaVersion: 1,
      data: "p",
      children: [child],
    });
    const { children, failures } = migrateElementTree(
      [source],
      new Map([
        [broken.type, broken],
        [working.type, working],
      ])
    );

    expect(failures).toHaveLength(1);
    expect(failures[0].element).toBe(source);
    expect((failures[0].error as Error).message).toBe("迁移崩溃");
    expect(children[0]).toMatchObject({ schemaVersion: 1, data: "p" });
    expect(children[0]!.children![0]).toMatchObject({ schemaVersion: 2, data: "leaf" });
  });

  it("某步改变了 id 或 type 视为失败", () => {
    const wrongId = definition({
      type: "acme.card",
      schemaVersion: 2,
      migrate: { 1: e => ({ ...e, id: "other" }) },
    });
    const wrongType = definition({
      type: "acme.card",
      schemaVersion: 2,
      migrate: { 1: e => ({ ...e, type: "acme.other" }) },
    });
    const a = element({ id: "a", type: "acme.card", schemaVersion: 1 });
    const b = element({ id: "b", type: "acme.card", schemaVersion: 1 });
    const result = migrateElementTree(
      [a, b],
      new Map([
        [wrongId.type, wrongId],
        [wrongType.type, wrongType],
      ])
    );
    expect(result.failures).toHaveLength(2);
    expect(result.children[0]).toBe(a);
    expect(result.children[1]).toBe(b);
  });
});

describe("元素定义版本装配校验", () => {
  it("schemaVersion=2 但缺 migrate[1] → invalid-definition", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.cards",
        create: () => ({
          elements: [definition({ type: "acme.card", schemaVersion: 2 })],
        }),
      }),
    ]);
    expect(errors).toMatchObject([
      { extensionId: "acme.cards", reason: "invalid-definition", target: "acme.card" },
    ]);
    expect(board.getPlugin("acme.card")).toBeUndefined();
  });

  it("schemaVersion=0 → invalid-definition", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.cards",
        create: () => ({
          elements: [definition({ type: "acme.card", schemaVersion: 0 })],
        }),
      }),
    ]);
    expect(errors).toMatchObject([{ extensionId: "acme.cards", reason: "invalid-definition" }]);
    expect(board.getPlugin("acme.card")).toBeUndefined();
  });

  it("schemaVersion 缺省或 1 时无需 migrate，正常装配", () => {
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.cards",
        create: () => ({ elements: [definition({ type: "acme.card" })] }),
      }),
    ]);
    expect(errors).toEqual([]);
    expect(board.getPlugin("acme.card")).toBeDefined();
  });
});

const cardExtension = (options: {
  schemaVersion: number;
  migrate?: WhiteboardElementDefinition["migrate"];
  render?: WhiteboardElementDefinition["render"];
}) =>
  defineWhiteboardExtension({
    id: "acme.cards",
    create: () => ({
      elements: [
        definition({
          type: "acme.card",
          schemaVersion: options.schemaVersion,
          migrate: options.migrate,
          ...(options.render ? { render: options.render } : {}),
        }),
      ],
    }),
  });

describe("加载迁移", () => {
  it("加载含 v1 元素的数据并安装 v2 扩展：快照为 v2，不 emit change，undo 栈为空", () => {
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
    board.on("onValueChange", valueChangeSpy);

    const errors = install(board, [
      cardExtension({
        schemaVersion: 2,
        migrate: { 1: e => ({ ...e, data: { text: (e.data as any).text, v2: true } }) },
      }),
    ]);
    expect(errors).toEqual([]);
    expect(board.getSnapshot().children[0]).toMatchObject({
      id: "c1",
      schemaVersion: 2,
      data: { text: "旧数据", v2: true },
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
      migrate: { 1: e => ({ ...e, data: "v2" }) },
    });

  it("api.submit 插入 v1 元素 → 快照中为 v2，undo/redo 正确", () => {
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
      schemaVersion: 2,
      data: "v2",
    });

    board.undo();
    expect(board.children).toHaveLength(0);
    board.redo();
    // undo/redo 重放的 insert_node 已是新版本数据，迁移 no-op，结果仍是 v2
    expect(board.children[0]).toMatchObject({ id: "fresh", schemaVersion: 2, data: "v2" });
  });

  it("粘贴 v1 元素 → 得到 v2", () => {
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
    expect(board.children[0]).toMatchObject({ schemaVersion: 2, data: "v2", x: 30, y: 40 });
  });

  it("删除 v2 元素后 undo 恢复的仍是 v2", () => {
    const board = createBoard([
      element({ id: "c1", type: "acme.card", schemaVersion: 1, data: "v1" }),
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
        migrate: { 1: e => ({ ...e, data: "v2" }) },
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

  it("迁移失败停在旧版本：migration-failed 占位", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const source = element({ id: "m1", type: "acme.card", schemaVersion: 1, data: "v1" });
    const board = createBoard([source]);
    install(board, [
      cardExtension({
        schemaVersion: 2,
        migrate: {
          1: () => {
            throw new Error("迁移崩溃");
          },
        },
      }),
    ]);
    const html = renderElement(board, board.children[0]);
    expect(html).toContain('data-unknown-reason="migration-failed"');
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
        create: () => ({
          elements: [definition({ type: "acme.orphan" })],
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

describe("迁移失败报告", () => {
  it("经 onExtensionError 每扩展汇总一次（多个失败元素也只一次）", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard([
      element({ id: "a", type: "acme.card", schemaVersion: 1 }),
      element({ id: "b", type: "acme.card", schemaVersion: 1 }),
    ]);
    const errors = install(board, [
      cardExtension({
        schemaVersion: 2,
        migrate: {
          1: () => {
            throw new Error("迁移崩溃");
          },
        },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ extensionId: "acme.cards", reason: "migration-failed" });
    expect(errors[0].message).toContain("2 个元素");
    expect(errors[0].message).toContain("迁移崩溃");

    // 插入路径的失败不再重复报告
    board.apply({
      type: "insert_node",
      path: [0],
      node: element({ id: "c", type: "acme.card", schemaVersion: 1 }),
    });
    expect(errors).toHaveLength(1);
    // 扩展的其它贡献不受影响
    expect(board.getPlugin("acme.card")).toBeDefined();
  });
});
