import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import Board from "../Board";
import type { BoardElement } from "../types";
import {
  defineElement,
  WhiteboardValidationError,
  type StandardSchemaV1,
  type TypedBoardElement,
} from "../extensions";
import {
  defineWhiteboardExtension,
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

interface StickyData {
  text: string;
}

const validateStickyData = (value: unknown): StandardSchemaV1.Result<StickyData> => {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as StickyData).text !== "string"
  ) {
    return { issues: [{ message: "text: 必填" }] };
  }
  return { value: value as StickyData };
};

const stickySchema: StandardSchemaV1<unknown, StickyData> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: validateStickyData,
  },
};

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

/** schema 定义可自由替换，便于构造异步 / 抛错 / 间谍版本 */
const stickyExtension = (
  schema: StandardSchemaV1,
  extras: {
    schemaVersion?: number;
    migrate?: Record<number, (element: BoardElement) => BoardElement>;
  } = {}
) =>
  defineWhiteboardExtension({
    id: "acme.stickies",
    elements: [
      defineElement({
        type: "acme.sticky",
        schema,
        render: () => <g data-sticky />,
        ...(extras.schemaVersion !== undefined ? { schemaVersion: extras.schemaVersion } : {}),
        ...(extras.migrate ? { migrate: extras.migrate } : {}),
      }),
    ],
    create: () => ({}),
  });

describe("defineElement 类型推断", () => {
  it("传入 schema 时 TData 由其输出类型推断，element 为 TypedBoardElement<TData>", () => {
    const definition = defineElement({
      type: "acme.sticky",
      schema: stickySchema,
      render: ({ element }) => {
        expectTypeOf(element).toEqualTypeOf<TypedBoardElement<StickyData>>();
        expectTypeOf(element.data.text).toEqualTypeOf<string>();
        return <g>{element.data.text}</g>;
      },
    });
    expect(definition.schema).toBe(stickySchema);
    // 无 schema 时退化为 BoardElement（data 为 any），旧用法兼容
    const legacy = defineElement({ type: "acme.plain", render: () => null });
    expectTypeOf(legacy.render).toEqualTypeOf<
      ComponentType<{ element: BoardElement; children?: ReactNode }>
    >();
  });
});

describe("插入校验", () => {
  it("合规 insert 通过；后续 set_node 改 x/y 不误伤", () => {
    const board = createBoard();
    install(board, [stickyExtension(stickySchema)]);
    board.apply({
      type: "insert_node",
      path: [0],
      node: element({ id: "s1", type: "acme.sticky", data: { text: "hi" } }),
    });
    expect(board.children).toHaveLength(1);
    board.apply({
      type: "set_node",
      path: [0],
      properties: { x: 10 },
      newProperties: { x: 50 },
    });
    expect(board.children[0]).toMatchObject({ id: "s1", x: 50, data: { text: "hi" } });
  });

  it("不合规 insert 抛 WhiteboardValidationError，快照 / undo / onChange 均不变", () => {
    const board = createBoard();
    install(board, [stickyExtension(stickySchema)]);
    const changeSpy = vi.fn();
    board.on("change", changeSpy);
    const before = board.getSnapshot();

    let error: unknown;
    try {
      board.apply({
        type: "insert_node",
        path: [0],
        node: element({ id: "bad", type: "acme.sticky", data: { text: 42 } }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(WhiteboardValidationError);
    expect((error as WhiteboardValidationError).problems).toMatchObject([
      { elementId: "bad", type: "acme.sticky", issues: [{ message: "text: 必填" }] },
    ]);
    expect((error as Error).message).toBe("白板元素 bad（acme.sticky）数据不合规：text: 必填");
    expect(board.getSnapshot()).toBe(before);
    expect(board.undos).toHaveLength(0);
    expect(board.children).toHaveLength(0);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it("同一批 ops 一合规一不合规 → 全部不应用（原子）", () => {
    const board = createBoard();
    install(board, [stickyExtension(stickySchema)]);
    expect(() =>
      board.apply([
        {
          type: "insert_node",
          path: [0],
          node: element({ id: "good", type: "acme.sticky", data: { text: "ok" } }),
        },
        {
          type: "insert_node",
          path: [1],
          node: element({ id: "bad", type: "acme.sticky", data: {} }),
        },
      ])
    ).toThrow(WhiteboardValidationError);
    expect(board.children).toHaveLength(0);
    expect(board.undos).toHaveLength(0);
  });

  it("子树中的不合规元素被发现", () => {
    const board = createBoard();
    install(board, [stickyExtension(stickySchema)]);
    let error: unknown;
    try {
      board.apply({
        type: "insert_node",
        path: [0],
        node: element({
          id: "parent",
          type: "acme.sticky",
          data: { text: "ok" },
          children: [element({ id: "child", type: "acme.sticky", data: { text: null } })],
        }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(WhiteboardValidationError);
    expect((error as WhiteboardValidationError).problems[0]).toMatchObject({
      elementId: "child",
      type: "acme.sticky",
    });
    expect(board.children).toHaveLength(0);
  });

  it("无 schema 的定义（内置等）不做任何校验", () => {
    const board = createBoard();
    install(board, [
      defineWhiteboardExtension({
        id: "acme.plain",
        elements: [defineElement({ type: "acme.plain", render: () => null })],
        create: () => ({}),
      }),
    ]);
    board.apply({
      type: "insert_node",
      path: [0],
      node: element({ id: "p1", type: "acme.plain", data: { anything: 1 } }),
    });
    expect(board.children).toHaveLength(1);
  });
});

describe("updateElement / set_node 校验", () => {
  const setup = () => {
    const board = createBoard();
    install(board, [stickyExtension(stickySchema)]);
    board.apply({
      type: "insert_node",
      path: [0],
      node: element({ id: "s1", type: "acme.sticky", data: { text: "hi" } }),
    });
    return board;
  };

  it("把 data 改坏 → 抛错且元素不变；改好 → 成功", () => {
    const board = setup();
    const api = board.extensions!.api;
    expect(() => api.updateElement("s1", { data: { text: 123 } })).toThrow(
      WhiteboardValidationError
    );
    expect(board.children[0].data).toEqual({ text: "hi" });
    expect(api.updateElement("s1", { data: { text: "world" } })).toBe(true);
    expect(board.children[0].data).toEqual({ text: "world" });
  });

  it("set_node 直接把 data 改坏同样被拦截", () => {
    const board = setup();
    expect(() =>
      board.apply({
        type: "set_node",
        path: [0],
        properties: { data: { text: "hi" } },
        newProperties: { data: "not-an-object" },
      })
    ).toThrow(WhiteboardValidationError);
    expect(board.children[0].data).toEqual({ text: "hi" });
  });

  it("同批 insert 引起路径后移后，set_node 仍定位到正确元素并拦截改坏 data", () => {
    const board = setup(); // children[0] = s1（acme.sticky，data.text = "hi"）
    // 混排批次的 path 相对批次前状态表达：set_node 的 [0] 指向 s1，
    // 执行时由路径管理器把插入 [0] 造成的位置后移换算成 [1]
    expect(() =>
      board.apply([
        {
          type: "insert_node",
          path: [0],
          node: element({ id: "shift", type: "acme.sticky", data: { text: "new" } }),
        },
        {
          type: "set_node",
          path: [0],
          properties: { data: { text: "hi" } },
          newProperties: { data: { text: 42 } },
        },
      ])
    ).toThrow(WhiteboardValidationError);
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ id: "s1", data: { text: "hi" } });
    // undo 栈仍是 setup 插入时留下的那 1 条，被拦截的批次未新增历史
    expect(board.undos).toHaveLength(1);
  });

  it("同批 insert + set_node 改好 data → 通过且全部生效", () => {
    const board = setup();
    board.apply([
      {
        type: "insert_node",
        path: [0],
        node: element({ id: "shift", type: "acme.sticky", data: { text: "new" } }),
      },
      {
        type: "set_node",
        path: [0],
        properties: { data: { text: "hi" } },
        newProperties: { data: { text: "updated" } },
      },
    ]);
    expect(board.children).toMatchObject([
      { id: "shift", data: { text: "new" } },
      { id: "s1", data: { text: "updated" } },
    ]);
  });
});

describe("异常 schema 行为", () => {
  it("validate 返回 Promise → 失败并提示必须同步校验", () => {
    const asyncSchema: StandardSchemaV1<unknown, StickyData> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: value => Promise.resolve(validateStickyData(value)),
      },
    };
    const board = createBoard();
    install(board, [stickyExtension(asyncSchema)]);
    expect(() =>
      board.apply({
        type: "insert_node",
        path: [0],
        node: element({ id: "a1", type: "acme.sticky", data: { text: "hi" } }),
      })
    ).toThrow("白板元素 schema 必须同步校验");
    expect(board.children).toHaveLength(0);
  });

  it("validate 抛错 → 失败并携带错误信息", () => {
    const throwingSchema: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => {
          throw new Error("schema 崩溃");
        },
      },
    };
    const board = createBoard();
    install(board, [stickyExtension(throwingSchema)]);
    expect(() =>
      board.apply({
        type: "insert_node",
        path: [0],
        node: element({ id: "t1", type: "acme.sticky", data: { text: "hi" } }),
      })
    ).toThrow("schema 崩溃");
    expect(board.children).toHaveLength(0);
  });
});

describe("版本兼容与校验范围", () => {
  it("版本不兼容（占位中）的元素不校验", () => {
    const board = createBoard();
    install(board, [
      stickyExtension(stickySchema, {
        schemaVersion: 2,
        migrate: { 1: element => ({ ...element }) },
      }),
    ]);
    // too-new（v3）且数据不合规：跳过校验，按占位原样插入
    board.apply({
      type: "insert_node",
      path: [0],
      node: element({ id: "future", type: "acme.sticky", schemaVersion: 3, data: { text: null } }),
    });
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ id: "future", schemaVersion: 3 });
  });

  it("插入旧版本保留原载荷，不执行当前版本迁移", () => {
    const board = createBoard();
    const migrate = vi.fn((element: BoardElement) => ({ ...element, schemaVersion: 2 }));
    install(board, [
      stickyExtension(stickySchema, {
        schemaVersion: 2,
        migrate: { 1: migrate },
      }),
    ]);
    expect(() =>
      board.apply({
        type: "insert_node",
        path: [0],
        node: element({ id: "old", type: "acme.sticky", schemaVersion: 1, data: {} }),
      })
    ).not.toThrow();
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ id: "old", schemaVersion: 1, data: {} });
    expect(migrate).not.toHaveBeenCalled();
  });
});

describe("加载迁移产物校验", () => {
  it("加载旧版本保持原样，不执行迁移或修复", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const source = element({ id: "m1", type: "acme.sticky", schemaVersion: 1, data: {} });
    const board = createBoard([source]);
    const errors = install(board, [
      stickyExtension(stickySchema, {
        schemaVersion: 2,
        migrate: { 1: element => ({ ...element, schemaVersion: 2 }) },
      }),
    ]);
    expect(errors).toHaveLength(0);
    // 元素保持迁移前原样（同一引用）
    expect(board.children[0]).toBe(source);
    expect(board.getSnapshot().children[0]).toMatchObject({ schemaVersion: 1, data: {} });
  });

  it("未迁移的原始数据（版本已是当前）不校验、不报错", () => {
    const source = element({ id: "raw", type: "acme.sticky", data: { text: null } });
    const board = createBoard([source]);
    const errors = install(board, [stickyExtension(stickySchema)]);
    expect(errors).toEqual([]);
    expect(board.children[0]).toBe(source);
  });
});

describe("粘贴与撤销重放", () => {
  it("粘贴不合规第三方元素 → 不崩溃、快照不变、console.error 被调用", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    install(board, [stickyExtension(stickySchema)]);
    const before = board.getSnapshot();
    const payload = buildClipboardPayload(board, [
      element({ id: "copied", type: "acme.sticky", data: { text: 42 } }),
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
    expect(() => plugin.onPaste(event, board)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain("数据不合规");
    expect(board.children).toHaveLength(0);
    expect(board.getSnapshot()).toBe(before);
  });

  it("undo/redo 重放不触发校验（validate 间谍计数不变）", () => {
    const validateSpy = vi.fn(validateStickyData);
    const spiedSchema: StandardSchemaV1<unknown, StickyData> = {
      "~standard": { version: 1, vendor: "test", validate: validateSpy },
    };
    const board = createBoard();
    install(board, [stickyExtension(spiedSchema)]);
    const api = board.extensions!.api;

    api.submit([
      {
        type: "insert_node",
        path: [0],
        node: element({ id: "s1", type: "acme.sticky", data: { text: "hi" } }),
      },
    ]);
    expect(validateSpy).toHaveBeenCalledTimes(1);

    // 用独立 historyGroup 避免删除与插入按 1 秒窗口合并进同一条 undo 记录
    board.apply({ type: "remove_node", path: [0], node: board.children[0] }, true, "remove");
    expect(validateSpy).toHaveBeenCalledTimes(1);

    board.undo();
    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(board.children).toMatchObject([{ id: "s1", data: { text: "hi" } }]);

    board.redo();
    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(board.children).toHaveLength(0);
  });
});
