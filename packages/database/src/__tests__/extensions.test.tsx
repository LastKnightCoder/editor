import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "../Database";
import { builtInPlugins } from "../plugins";
import { defineDatabaseExtension, installDatabaseExtensions } from "../extensions";
import type { DatabaseExtension } from "../extensions";
import type { CellPlugin } from "../types";

const stubPlugin = (overrides: Partial<CellPlugin<unknown>>): CellPlugin<unknown> => ({
  type: "stub",
  name: "桩",
  Renderer: () => null,
  ...overrides,
});

const install = (extensions: readonly DatabaseExtension[]) =>
  installDatabaseExtensions(builtInPlugins as CellPlugin<unknown>[], extensions);

const textPlugin = builtInPlugins.find(plugin => plugin.type === "text") as CellPlugin<unknown>;

describe("defineDatabaseExtension", () => {
  it("id 不含命名空间时报错，合法定义返回冻结对象", () => {
    expect(() => defineDatabaseExtension({ id: "nonsense", create: () => ({}) })).toThrowError(
      "Database 扩展 ID 必须包含命名空间"
    );
    const extension = defineDatabaseExtension({ id: "test.ok", create: () => ({}) });
    expect(extension.apiVersion).toBe(1);
    expect(Object.isFrozen(extension)).toBe(true);
  });
});

describe("installDatabaseExtensions", () => {
  it("装配 fieldTypes、slots 与 activators", () => {
    const Image = () => null;
    const activate = () => undefined;
    const { pluginManager, slots, activators } = install([
      defineDatabaseExtension({
        id: "test.contribute",
        create: () => ({
          fieldTypes: [stubPlugin({ type: "host-field" })],
          slots: { Image },
          activate,
        }),
      }),
    ]);
    expect(pluginManager.hasPlugin("host-field")).toBe(true);
    expect(slots.Image).toBe(Image);
    expect(activators).toEqual([activate]);
  });

  it("扩展 id 重复报错", () => {
    const extension = defineDatabaseExtension({ id: "test.dup", create: () => ({}) });
    expect(() => install([extension, extension])).toThrowError("test.dup");
  });

  it("fieldTypes 与内置或彼此重复报错，信息带扩展 id 与类型", () => {
    expect(() =>
      install([
        defineDatabaseExtension({
          id: "test.text",
          create: () => ({ fieldTypes: [textPlugin] }),
        }),
      ])
    ).toThrowError(/test\.text.*text/);

    const hostField = stubPlugin({ type: "host-field" });
    expect(() =>
      install([
        defineDatabaseExtension({ id: "test.a", create: () => ({ fieldTypes: [hostField] }) }),
        defineDatabaseExtension({ id: "test.b", create: () => ({ fieldTypes: [hostField] }) }),
      ])
    ).toThrowError(/test\.b.*host-field/);
  });

  it("fieldOverride 浅合并，未覆盖成员保留", () => {
    const { pluginManager } = install([
      defineDatabaseExtension({
        id: "test.override",
        create: () => ({ fieldOverrides: [{ type: "date", patch: { name: "改名的日期" } }] }),
      }),
    ]);
    expect(pluginManager.getPlugin("date")?.name).toBe("改名的日期");
    expect(pluginManager.hasCapability("date", "date")).toBe(true);
  });

  it("fieldOverride 目标类型不存在报错", () => {
    expect(() =>
      install([
        defineDatabaseExtension({
          id: "test.missing",
          create: () => ({ fieldOverrides: [{ type: "no-such-type", patch: { name: "x" } }] }),
        }),
      ])
    ).toThrowError(/test\.missing.*no-such-type/);
  });

  it("同一类型被两个扩展覆盖报错，信息带双方 id", () => {
    const overrideDate = (id: string) =>
      defineDatabaseExtension({
        id,
        create: () => ({ fieldOverrides: [{ type: "date", patch: { name: id } }] }),
      });
    expect(() => install([overrideDate("test.first"), overrideDate("test.second")])).toThrowError(
      /date.*test\.first.*test\.second/
    );
  });

  it("同一插槽键被两个扩展提供报错", () => {
    const provideImage = (id: string) =>
      defineDatabaseExtension({
        id,
        create: () => ({ slots: { Image: () => null } }),
      });
    expect(() => install([provideImage("test.a"), provideImage("test.b")])).toThrowError(
      /Image.*test\.a.*test\.b/
    );
  });

  it("聚合算子登记到注册表，无命名空间或重名报错（带扩展 id）", () => {
    const registry = () => installDatabaseExtensions(builtInPlugins as CellPlugin<unknown>[], []);
    expect(registry().aggregateRegistry.has("sum")).toBe(true);
    expect(registry().aggregateRegistry.list()).toHaveLength(9);

    expect(() =>
      install([
        defineDatabaseExtension({
          id: "test.agg",
          create: () => ({
            aggregates: [
              { op: "range", label: "极差", resultKind: "numeric", compute: () => null },
            ],
          }),
        }),
      ])
    ).toThrowError(/test\.agg.*命名空间.*range/);

    expect(() =>
      install([
        defineDatabaseExtension({
          id: "test.agg",
          create: () => ({
            aggregates: [
              { op: "sum", label: "撞内置", resultKind: "numeric", compute: () => null },
            ],
          }),
        }),
      ])
    ).toThrowError(/test\.agg.*已存在的聚合算子.*sum/);

    const extensionAggregate = (id: string, op: string) =>
      defineDatabaseExtension({
        id,
        create: () => ({
          aggregates: [{ op, label: op, resultKind: "numeric" as const, compute: () => null }],
        }),
      });
    expect(() =>
      install([
        extensionAggregate("test.a", "acme.range"),
        extensionAggregate("test.b", "acme.range"),
      ])
    ).toThrowError(/acme\.range.*test\.a.*test\.b/);
  });

  it("命令贡献登记，无命名空间或 id 冲突报错（带扩展 id）", () => {
    const command = (id: string, commandId: string) =>
      defineDatabaseExtension({
        id,
        create: () => ({
          commands: [{ id: commandId, label: commandId, placement: "row", run: () => undefined }],
        }),
      });

    const { commands } = install([command("test.cmd", "acme.duplicate")]);
    expect(commands.map(item => item.id)).toEqual(["acme.duplicate"]);

    expect(() => install([command("test.cmd", "duplicate")])).toThrowError(
      /test\.cmd.*命名空间.*duplicate/
    );
    expect(() =>
      install([command("test.a", "acme.dup"), command("test.b", "acme.dup")])
    ).toThrowError(/acme\.dup.*test\.a.*test\.b/);
  });
});

const baseConfig = {
  columnOrder: ["title"],
  rowOrder: ["row-a"],
  sorts: [],
  filters: null,
};
const baseProps = {
  columns: [{ id: "title", title: "名称", type: "text", isPrimary: true }],
  data: [{ id: "row-a", title: "内容" }],
  views: [{ id: 1, name: "表格", type: "table" as const, order: 0, config: baseConfig }],
  activeViewId: 1,
  viewConfig: baseConfig,
};

afterEach(() => vi.unstubAllGlobals());

describe("Database 扩展生命周期", () => {
  it("activate 在挂载时按序启动，重渲染不重复，卸载时反序清理", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const order: string[] = [];
    const extensions = [
      defineDatabaseExtension({
        id: "test.first",
        create: () => ({
          activate: () => {
            order.push("first-start");
            return () => order.push("first-cleanup");
          },
        }),
      }),
      defineDatabaseExtension({
        id: "test.second",
        create: () => ({
          activate: () => {
            order.push("second-start");
            return () => order.push("second-cleanup");
          },
        }),
      }),
    ];
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Database {...baseProps} extensions={extensions} />
          </DndProvider>
        )
      );
      expect(order).toEqual(["first-start", "second-start"]);
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Database {...baseProps} extensions={extensions} />
          </DndProvider>
        )
      );
      expect(order).toEqual(["first-start", "second-start"]);
      await act(async () => root.unmount());
      expect(order).toEqual(["first-start", "second-start", "second-cleanup", "first-cleanup"]);
    } finally {
      host.remove();
    }
  });

  it("extensions 引用变化报错", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const first = [defineDatabaseExtension({ id: "test.stable", create: () => ({}) })];
    const second = [defineDatabaseExtension({ id: "test.stable", create: () => ({}) })];
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Database {...baseProps} extensions={first} />
          </DndProvider>
        )
      );
      expect(() =>
        act(() =>
          root.render(
            <DndProvider backend={HTML5Backend}>
              <Database {...baseProps} extensions={second} />
            </DndProvider>
          )
        )
      ).toThrowError("Database 扩展集合必须稳定");
    } finally {
      host.remove();
    }
  });
});
