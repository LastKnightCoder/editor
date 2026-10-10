import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import {
  defineWhiteboardExtension,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { createArrowExtension } from "../extensions/builtins";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const node = (type: string, id = type) => ({ id, type, x: 10, y: 20, width: 100, height: 80 });
const boards: Board[] = [];
const createBoard = (children: ReturnType<typeof node>[] = []) => {
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
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("白板扩展命名空间与冲突降级", () => {
  it("非 tau 扩展声明裸名类型被禁用，画布与其它扩展继续工作", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    const errors: WhiteboardExtensionError[] = [];
    const good = defineWhiteboardExtension({
      id: "acme.good",
      create: () => ({
        elements: [{ type: "acme.marker", render: () => <g data-acme-marker /> }],
      }),
    });
    const rogue = defineWhiteboardExtension({
      id: "acme.rogue",
      create: () => ({ elements: [{ type: "sticky", render: () => null }] }),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <WhiteBoard
            extensions={[good, rogue]}
            onExtensionError={error => errors.push(error)}
            initData={[node("acme.marker", "m1"), node("sticky", "s1")]}
            initViewPort={viewport}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
          />
        )
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        extensionId: "acme.rogue",
        reason: "invalid-namespace",
        target: "sticky",
      });
      expect(container.querySelector("[data-whiteboard-root]")).toBeTruthy();
      expect(container.querySelector("[data-acme-marker]")).toBeTruthy();
      expect(container.querySelector('[data-unknown-element="s1"]')).toBeTruthy();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("声明他方命名空间类型或无命名空间命令被禁用", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrongType = defineWhiteboardExtension({
      id: "acme.notes",
      create: () => ({ elements: [{ type: "other.sticky", render: () => null }] }),
    });
    let board = createBoard();
    let errors = install(board, [wrongType]);
    expect(errors).toMatchObject([
      { extensionId: "acme.notes", reason: "invalid-namespace", target: "other.sticky" },
    ]);

    const wrongCommand = defineWhiteboardExtension({
      id: "acme.commands",
      create: () => ({ commands: [{ id: "foo", execute: () => {} }] }),
    });
    board = createBoard();
    errors = install(board, [wrongCommand]);
    expect(errors).toMatchObject([
      { extensionId: "acme.commands", reason: "invalid-namespace", target: "foo" },
    ]);
  });

  it("相同元素类型禁用后来者，其命令与工具均未注册", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const make = (id: string) =>
      defineWhiteboardExtension({
        id,
        create: () => ({
          elements: [{ type: "acme.sticky", render: () => <g data-acme-sticky /> }],
          commands: [{ id: `${id}.ping`, execute: () => "pong" }],
          tools: [
            {
              id: `${id}.tool`,
              command: `${id}.ping`,
              order: 1,
              group: "acme",
              component: () => null,
            },
          ],
        }),
      });
    const board = createBoard([node("acme.sticky")]);
    const errors = install(board, [make("acme.a"), make("acme.b")]);
    expect(errors).toMatchObject([
      {
        extensionId: "acme.b",
        reason: "conflict",
        target: "acme.sticky",
        conflictWith: "acme.a",
      },
    ]);
    await expect(board.extensions!.execute("acme.a.ping")).resolves.toBe("pong");
    await expect(board.extensions!.execute("acme.b.ping")).rejects.toThrow("未注册白板命令");
    expect(board.extensions!.tools.map(tool => tool.id)).toEqual(["acme.a.tool"]);
    const html = renderToStaticMarkup(<svg>{board.renderElement(board.children[0])}</svg>);
    expect(html).toContain("data-acme-sticky");
  });

  it("第三方扩展声明本命名空间类型，内置扩展不受影响", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      createArrowExtension(),
      defineWhiteboardExtension({
        id: "acme.embed",
        create: () => ({ elements: [{ type: "acme.x", render: () => null }] }),
      }),
    ]);
    expect(errors).toEqual([]);
    expect(board.getPlugin("arrow")).toBeDefined();
    expect(board.getPlugin("acme.x")).toBeDefined();
  });

  it("id 重复、版本不支持与创建抛错分别禁用对应扩展", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const twin = defineWhiteboardExtension({ id: "acme.twin", create: () => ({}) });
    const legacy = {
      id: "acme.legacy",
      apiVersion: 2,
      create: () => ({}),
    } as unknown as WhiteboardExtension;
    const broken = defineWhiteboardExtension({
      id: "acme.broken",
      create: () => {
        throw new Error("创建失败");
      },
    });
    const ok = defineWhiteboardExtension({
      id: "acme.ok",
      create: () => ({ commands: [{ id: "acme.ok.ping", execute: () => "pong" }] }),
    });
    const board = createBoard();
    const errors = install(board, [ok, twin, twin, legacy, broken]);
    expect(errors).toMatchObject([
      { extensionId: "acme.twin", reason: "duplicate-extension", conflictWith: "acme.twin" },
      { extensionId: "acme.legacy", reason: "unsupported-api-version" },
      { extensionId: "acme.broken", reason: "create-failed" },
    ]);
    await expect(board.extensions!.execute("acme.ok.ping")).resolves.toBe("pong");
  });

  it("被禁用扩展的订阅被移除、异步提交废弃且 dispose 被调用", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn();
    const disposed = vi.fn();
    let valid: (() => boolean) | undefined;
    const board = createBoard([node("acme.sticky")]);
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.watch",
        create: api => {
          api.on("change", listener);
          valid = api.captureSubmission("acme.sticky");
          return { dispose: disposed, commands: [{ id: "bare", execute: () => {} }] };
        },
      }),
    ]);
    expect(errors).toMatchObject([{ extensionId: "acme.watch", reason: "invalid-namespace" }]);
    expect(disposed).toHaveBeenCalledOnce();
    board.emit("change");
    expect(listener).not.toHaveBeenCalled();
    expect(valid!()).toBe(false);
  });

  it("工具引用不存在的命令时禁用引用方扩展", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.dangling",
        create: () => ({
          elements: [{ type: "acme.orphan", render: () => null }],
          tools: [
            {
              id: "acme.dangling.tool",
              command: "acme.missing.run",
              order: 1,
              group: "acme",
              component: () => null,
            },
          ],
        }),
      }),
    ]);
    expect(errors).toMatchObject([
      { extensionId: "acme.dangling", reason: "missing-command", target: "acme.missing.run" },
    ]);
    expect(board.getPlugin("acme.orphan")).toBeUndefined();
    expect(board.extensions!.tools).toEqual([]);
  });
});
