import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Board from "../Board";
import {
  defineWhiteboardExtension,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { createWhiteboardSession } from "../public";
import { WHITEBOARD_DOCUMENT_VERSION } from "../document-version";
import { buildClipboardPayload } from "../utils/ClipboardUtil";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const node = (id = "a") => ({ id, type: "unknown", x: 10, y: 20, width: 100, height: 80 });
const boards: Board[] = [];
const create = () => {
  const board = new Board([node()], viewport, { selectedElements: [], selectArea: null });
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

describe("白板扩展契约", () => {
  it("重复扩展、元素类型与命令按先到先得禁用后来者", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const empty = defineWhiteboardExtension({ id: "test.empty", create: () => ({}) });
    let board = create();
    let errors = install(board, [empty, empty]);
    expect(errors).toMatchObject([
      { extensionId: "test.empty", reason: "duplicate-extension", conflictWith: "test.empty" },
    ]);
    expect(board.extensions!.getRejectedExtensions()).toHaveLength(1);
    const element = (id: string) =>
      defineWhiteboardExtension({
        id,
        create: () => ({ elements: [{ type: "test.same", render: () => null }] }),
      });
    board = create();
    errors = install(board, [element("test.a"), element("test.b")]);
    expect(errors).toMatchObject([
      { extensionId: "test.b", reason: "conflict", target: "test.same", conflictWith: "test.a" },
    ]);
    const command = (id: string) =>
      defineWhiteboardExtension({
        id,
        create: () => ({ commands: [{ id: "test.command", execute: () => {} }] }),
      });
    board = create();
    errors = install(board, [command("test.a"), command("test.b")]);
    expect(errors).toMatchObject([
      { extensionId: "test.b", reason: "conflict", target: "test.command", conflictWith: "test.a" },
    ]);
  });

  it("同一扩展声明在不同 Board 上创建独立状态，暂停与卸载各清理一次", () => {
    const activated = vi.fn(),
      paused = vi.fn(),
      disposed = vi.fn();
    const extension = defineWhiteboardExtension({
      id: "test.lifecycle",
      create: () => {
        let count = 0;
        return {
          commands: [{ id: "test.count", execute: () => ++count }],
          activate() {
            activated();
            return paused;
          },
          dispose: disposed,
        };
      },
    });
    const first = create(),
      second = create();
    first.installExtensions([extension]);
    second.installExtensions([extension]);
    first.setActive(true);
    second.setActive(true);
    expect(activated).toHaveBeenCalledTimes(2);
    first.setActive(false);
    first.setActive(false);
    expect(paused).toHaveBeenCalledTimes(1);
    first.setActive(true);
    expect(activated).toHaveBeenCalledTimes(3);
    first.destroy();
    first.destroy();
    second.destroy();
    expect(paused).toHaveBeenCalledTimes(3);
    expect(disposed).toHaveBeenCalledTimes(2);
  });

  it("扩展命令私有状态不跨实例共享", async () => {
    const extension = defineWhiteboardExtension({
      id: "test.state",
      create: () => {
        let count = 0;
        return { commands: [{ id: "test.count", execute: () => ++count }] };
      },
    });
    const first = create(),
      second = create();
    first.installExtensions([extension]);
    second.installExtensions([extension]);
    expect(await first.extensions!.execute("test.count")).toBe(1);
    expect(await first.extensions!.execute("test.count")).toBe(2);
    expect(await second.extensions!.execute("test.count")).toBe(1);
  });

  it("观察者抛错时快照已提交，后续保存监听器仍收到通知", () => {
    const board = create();
    const saved = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    board.on("onValueChange", () => {
      expect(board.getSnapshot().children[0].x).toBe(30);
      throw new Error("扩展损坏");
    });
    board.on("change", () => {
      throw new Error("另一个扩展损坏");
    });
    board.on("change", saved);
    board.apply({ type: "set_node", path: [0], properties: { x: 10 }, newProperties: { x: 30 } });
    expect(saved).toHaveBeenCalledOnce();
    expect(board.getSnapshot().children[0].x).toBe(30);
    board.undo();
    expect(board.children[0].x).toBe(10);
  });

  it("一次性监听器即使抛错也只执行一次", () => {
    const board = create();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn(() => {
      throw new Error("失败");
    });
    board.once("test", listener);
    board.emit("test");
    board.emit("test");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("未知元素保留子树并可命中、移动及复制", () => {
    const board = create();
    const parent = { ...node(), children: [{ ...node("child"), x: 50 }] };
    board.children = [parent];
    expect(board.isHit(parent, 20, 30)).toBe(true);
    expect(board.moveElement(parent, 20, 20)?.children?.[0].x).toBe(70);
    const html = renderToStaticMarkup(<svg>{board.renderElement(parent)}</svg>);
    expect(html).toContain('data-unknown-element="a"');
    expect(html).toContain('data-unknown-element="child"');
    const copied = JSON.parse(buildClipboardPayload(board, [parent])!);
    expect(copied.elements[0].children[0].id).toBe("child");
    expect(parent.x).toBe(10);
  });

  it("未知无几何元素仍保留在文档与复制结果中", () => {
    const board = create();
    const element = { id: "opaque", type: "third-party", payload: { secretShape: [1, 2, 3] } };
    expect(JSON.parse(buildClipboardPayload(board, [element])!).elements[0]).toEqual(element);
  });

  it("对外快照稳定且不可写，元素查询返回副本", () => {
    const board = create();
    board.installExtensions([]);
    const api = board.extensions!.api;
    expect(api.getSnapshot()).toBe(api.getSnapshot());
    expect(() => {
      api.children[0].x = 999;
    }).toThrow();
    const element = api.getElement("a")!;
    element.x = 999;
    expect(board.children[0].x).toBe(10);
    expect(api).not.toHaveProperty("undos");
    expect(api).not.toHaveProperty("services");
    expect(api).not.toHaveProperty("getPlugin");
    expect(api.updateElement("a", { x: 42 })).toBe(true);
    expect(api.children[0].x).toBe(42);
  });

  it("隐藏、只读或目标删除后的异步提交永久失效", () => {
    const board = create();
    board.installExtensions([]);
    const api = board.extensions!.api;
    const pending = api.captureSubmission("a");
    board.setActive(false);
    board.setActive(true);
    expect(pending()).toBe(false);
    board.readonly = true;
    expect(api.updateElement("a", { x: 20 })).toBe(false);
    api.submit([{ type: "remove_node", path: [0], node: node() }]);
    expect(board.children).toHaveLength(1);
  });

  it("视口变化复用未修改元素的只读副本", () => {
    const board = create();
    board.installExtensions([]);
    const api = board.extensions!.api;
    const previous = api.children;
    board.apply(
      { type: "set_viewport", properties: { minX: 0 }, newProperties: { minX: 10 } },
      false
    );
    expect(api.children).toBe(previous);
    expect(api.viewPort.minX).toBe(10);
  });

  it("输入规则只认领一次，失败不会转交后续规则重复导入", () => {
    const board = create();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const second = vi.fn();
    board.installExtensions([
      defineWhiteboardExtension({
        id: "test.import",
        create: () => ({
          ingest: [
            {
              id: "test.first",
              source: "paste",
              accepts: () => true,
              run: () => {
                throw new Error("导入失败");
              },
            },
            { id: "test.second", source: "paste", accepts: () => true, run: second },
          ],
        }),
      }),
    ]);
    const event = new Event("paste", { cancelable: true }) as ClipboardEvent;
    board.onPaste(event);
    expect(event.defaultPrevented).toBe(true);
    expect(second).not.toHaveBeenCalled();
  });

  it("命名空间违规的扩展被整体禁用，不注册任何贡献", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = create();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "test.rogue",
        create: () => ({
          elements: [{ type: "test-node", render: () => null }],
          commands: [{ id: "test.rogue.ok", execute: () => {} }],
        }),
      }),
    ]);
    expect(errors).toMatchObject([{ extensionId: "test.rogue", reason: "invalid-namespace" }]);
    expect(board.getPlugin("test-node")).toBeUndefined();
  });

  it("被禁用扩展的订阅被清理且异步提交废弃", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = create();
    const listener = vi.fn();
    let valid!: () => boolean;
    const extension = defineWhiteboardExtension({
      id: "test.failed",
      create: api => {
        api.on("change", listener);
        valid = api.captureSubmission("a");
        throw new Error("安装失败");
      },
    });
    const errors = install(board, [extension]);
    expect(errors).toMatchObject([
      {
        extensionId: "test.failed",
        reason: "create-failed",
        message: expect.stringContaining("安装失败"),
      },
    ]);
    board.emit("change");
    expect(listener).not.toHaveBeenCalled();
    expect(valid()).toBe(false);
  });

  it("相邻命令使用独立历史分组，不受一秒合并影响", () => {
    const board = create();
    board.installExtensions([]);
    const api = board.extensions!.api;
    api.submit([{ type: "set_node", path: [0], properties: { x: 10 }, newProperties: { x: 20 } }], {
      historyGroup: "first",
    });
    api.submit([{ type: "set_node", path: [0], properties: { x: 20 }, newProperties: { x: 30 } }], {
      historyGroup: "second",
    });
    board.undo();
    expect(board.children[0].x).toBe(20);
    board.undo();
    expect(board.children[0].x).toBe(10);
  });

  it("视口裁剪优先消费扩展的几何边界", () => {
    const board = create();
    board.children = [{ ...node(), type: "test.offscreen" }];
    board.installExtensions([
      defineWhiteboardExtension({
        id: "test.bounds",
        create: () => ({
          elements: [
            {
              type: "test.offscreen",
              render: () => null,
              getBounds: () => ({ minX: 2000, minY: 2000, maxX: 2100, maxY: 2100 }),
            },
          ],
        }),
      }),
    ]);
    expect(board.filterElementsInViewport(board.children)).toEqual([]);
  });

  it("无界面会话保留受控生命周期，不返回内核实例", () => {
    const session = createWhiteboardSession({
      children: [node()],
      viewPort: viewport,
      selection: { selectedElements: [], selectArea: null },
      version: WHITEBOARD_DOCUMENT_VERSION,
    });
    expect(session.api.children).toHaveLength(1);
    session.setReadonly(true);
    expect(session.api.readonly).toBe(true);
    session.dispose();
    expect(session.api.isDestroyed).toBe(true);
  });
});
