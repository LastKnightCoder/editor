import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import {
  defineWhiteboardExtension,
  type WhiteboardAPI,
  type WhiteboardExtension,
} from "../extensions/api";
import { createVideoExtension } from "../extensions/builtins";
import type { BoardElement } from "../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const node = (id = "a") => ({ id, type: "unknown", x: 10, y: 20, width: 100, height: 80 });
const boards: Board[] = [];
const create = () => {
  const board = new Board([node()], viewport, { selectedElements: [], selectArea: null });
  boards.push(board);
  return board;
};

/** 装配扩展并按 id 取回各自的作用域 API */
function installScoped(
  board: Board,
  extensions: readonly WhiteboardExtension[]
): Map<string, WhiteboardAPI> {
  const apis = new Map<string, WhiteboardAPI>();
  board.installExtensions(
    extensions.map(extension => ({
      ...extension,
      create(api: WhiteboardAPI) {
        apis.set(extension.id, api);
        return extension.create(api);
      },
    }))
  );
  return apis;
}

afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
});

describe("事件命名空间", () => {
  it("扩展只能发出自己命名空间的事件，其它扩展可订阅", () => {
    const board = create();
    const received: unknown[] = [];
    const apis = installScoped(board, [
      defineWhiteboardExtension({ id: "acme.x", create: () => ({}) }),
      defineWhiteboardExtension({
        id: "other.y",
        create: api => {
          api.on("acme.ping", (value: unknown) => received.push(value));
          return {};
        },
      }),
    ]);
    const acme = apis.get("acme.x")!;
    acme.emit("acme.ping", 42);
    expect(received).toEqual([42]);
  });

  it("跨命名空间、内核事件与裸名事件一律抛错且监听者收不到", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = create();
    const boardSpy = vi.fn();
    const apis = installScoped(board, [
      defineWhiteboardExtension({ id: "acme.x", create: () => ({}) }),
    ]);
    board.on("tau.modal.open", boardSpy);
    board.on("change", boardSpy);
    board.on("value:change", boardSpy);
    board.on("acme.ping", boardSpy);
    const acme = apis.get("acme.x")!;
    expect(() => acme.emit("tau.modal.open", {})).toThrow(/命名空间/);
    // @ts-expect-error 内核事件不能经扩展 API 发出
    expect(() => acme.emit("change")).toThrow(/内核/);
    // @ts-expect-error 内核事件不能经扩展 API 发出
    expect(() => acme.emit("value:change", [])).toThrow(/内核/);
    // @ts-expect-error 扩展事件必须是 <命名空间>.<名称> 格式
    expect(() => acme.emit("foo")).toThrow(/格式/);
    expect(boardSpy).not.toHaveBeenCalled();
  });

  it("tau 命名空间扩展可以发出与订阅 tau.modal.open", () => {
    const board = create();
    const received: unknown[] = [];
    const apis = installScoped(board, [
      defineWhiteboardExtension({
        id: "tau.dummy",
        create: api => {
          api.on("tau.modal.open", payload => received.push(payload));
          return {};
        },
      }),
    ]);
    expect(() => apis.get("tau.dummy")!.emit("tau.modal.open", { type: "image" })).not.toThrow();
    expect(received).toEqual([{ type: "image" }]);
  });

  it("api.on 订阅内核事件收到冻结快照", () => {
    const board = create();
    let changedChildren: readonly BoardElement[] | undefined;
    let removedElements: readonly BoardElement[] | undefined;
    let selection: unknown;
    installScoped(board, [
      defineWhiteboardExtension({
        id: "test.snapshot",
        create: api => {
          api.on("value:change", children => (changedChildren = children));
          api.on("selection:change", value => (selection = value));
          api.on("element:remove", elements => (removedElements = elements));
          return {};
        },
      }),
    ]);
    board.apply(
      { type: "set_node", path: [0], properties: { x: 10 }, newProperties: { x: 30 } },
      false
    );
    board.apply({ type: "remove_node", path: [0], node: node() }, false);
    expect(Object.isFrozen(changedChildren)).toBe(true);
    expect(Object.isFrozen(changedChildren?.[0])).toBe(true);
    expect(Object.isFrozen(selection)).toBe(true);
    expect(Object.isFrozen(removedElements)).toBe(true);
    expect(removedElements?.[0]?.id).toBe("a");
  });

  it("api.on 拒绝 internal: 事件与未知裸名，允许任意命名空间扩展事件", () => {
    const board = create();
    const apis = installScoped(board, [
      defineWhiteboardExtension({ id: "test.listen", create: () => ({}) }),
    ]);
    const api = apis.get("test.listen")!;
    // @ts-expect-error internal: 前缀事件不在公共事件通道
    expect(() => api.on("internal:creation-preview-change", () => {})).toThrow(/internal/);
    // @ts-expect-error 未知事件名不允许订阅
    expect(() => api.on("creation-preview:change", () => {})).toThrow(/未知白板事件名/);
    expect(() => api.on("acme.anything", () => {})).not.toThrow();
  });

  it("api.on 按内核事件表推断参数类型，api.emit 拒绝内核事件名", () => {
    const board = create();
    board.installExtensions([]);
    const api = board.extensions!.api;
    api.on("value:change", children => {
      expectTypeOf(children).toEqualTypeOf<BoardElement[]>();
    });
    api.on("active-tool:change", (id, options) => {
      expectTypeOf(id).toEqualTypeOf<string>();
      expectTypeOf(options).toEqualTypeOf<Readonly<Record<string, unknown>> | null>();
    });
    // @ts-expect-error 内核事件不能经扩展 API 发出
    expect(() => api.emit("change")).toThrow(/内核/);
    // @ts-expect-error 扩展事件必须是 <命名空间>.<名称> 格式
    expect(() => api.emit("internal:creation-preview-change")).toThrow(/internal/);
  });

  it("主 API 的 emit 只允许 tau 命名空间", () => {
    const board = create();
    board.installExtensions([]);
    const api = board.extensions!.api;
    expect(() => api.emit("acme.x")).toThrow(/命名空间/);
    // @ts-expect-error 内核事件不能经扩展 API 发出
    expect(() => api.emit("change")).toThrow(/内核/);
    const heard: unknown[] = [];
    api.on("tau.document.open", (id: unknown) => heard.push(id));
    expect(() => api.emit("tau.document.open", "el")).not.toThrow();
    expect(heard).toEqual(["el"]);
  });

  it("Body 组件收到扩展作用域 API，emit 受命名空间约束", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    let bodyApi!: WhiteboardAPI;
    const extensions = [
      createVideoExtension({
        Body: (props: any) => {
          bodyApi = props.board;
          return <g data-test-video />;
        },
      }),
    ];
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <WhiteBoard
            extensions={extensions}
            initData={[
              {
                id: "video",
                type: "video",
                src: "video.mp4",
                x: 10,
                y: 20,
                width: 100,
                height: 80,
              },
            ]}
            initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
          />
        )
      );
      expect(bodyApi).toBeDefined();
      expect(() => bodyApi.emit("acme.x")).toThrow(/命名空间/);
      const heard: unknown[] = [];
      bodyApi.on("tau.document.open", (id: unknown) => heard.push(id));
      expect(() => bodyApi.emit("tau.document.open", "el")).not.toThrow();
      expect(heard).toEqual(["el"]);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
