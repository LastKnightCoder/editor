import { describe, expect, it, vi } from "vitest";
import { createDatabaseStore } from "../../DatabaseStore";
import PluginManager from "../../PluginManager";

describe("宿主边界", () => {
  it("删除行只清理一次原行快照，external 移除不重复清理", () => {
    const cleanup = vi.fn();
    const row = { id: "r", detailContentId: 12 };
    const store = createDatabaseStore(
      [],
      [row],
      undefined,
      undefined,
      undefined,
      undefined,
      cleanup
    );
    store.getState().deleteRow("r");
    store.getState().deleteRow("r");
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(row);
    store.getState().dispatch({ type: "rows.receive", rows: [{ id: "s", detailContentId: 13 }] });
    store
      .getState()
      .dispatch({ type: "rows.apply", changes: { upsert: [], remove: ["s"] } }, "external");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("不同实例的插件与清理回调互不影响", () => {
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();
    const a = createDatabaseStore(
      [],
      [{ id: "r" }],
      undefined,
      undefined,
      undefined,
      undefined,
      cleanupA
    );
    const b = createDatabaseStore(
      [],
      [{ id: "r" }],
      undefined,
      undefined,
      undefined,
      undefined,
      cleanupB
    );
    a.getState().deleteRow("r");
    expect(b.getState().rows).toHaveLength(1);
    expect(cleanupB).not.toHaveBeenCalled();
    expect(cleanupA).toHaveBeenCalledTimes(1);
  });

  it("缺失插件不变换字段原值、不暴露编辑器、不进入可创建类型列表", () => {
    const manager = new PluginManager();
    const value = [{ contentId: 18 }];
    expect(manager.getPlugin("rich-text")?.editable).toBe(false);
    expect(manager.getPlugin("rich-text")?.Editor).toBeUndefined();
    expect(manager.getAllPlugins()).toEqual([]);
    expect(manager.transformAfterLoad("rich-text", value, {})).toBe(value);
    expect(manager.transformBeforeSave("rich-text", value, {})).toBe(value);
  });
});
