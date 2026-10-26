import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DataTableView } from "@/types";
import {
  CARD_DATABASE_PREFERENCES_KEY,
  createCardDatabasePreferencesStore,
} from "../databasePreferences";

const view = (id: number, name = "已保存视图"): DataTableView => ({
  id,
  tableId: 0,
  name,
  type: "gallery",
  order: 0,
  createTime: 10,
  updateTime: 20,
  config: {
    columnOrder: ["title", "tags"],
    rowOrder: ["2", "1"],
    sorts: [],
    filters: null,
    groupBy: null,
    viewOptions: { gallery: { coverType: "detail" } },
  },
});
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("卡片数据库视图偏好", () => {
  it("旧版本偏好使用默认视图，不继承旧模板，各库独立修改", () => {
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        state: {
          byDatabase: {},
          legacyDefaults: { views: [view(11)], activeViewId: 11, columnWidths: { title: 320 } },
        },
      })
    );
    const store = createCardDatabasePreferencesStore(localStorage);
    const actions = store.getState();
    actions.initialize("a");
    actions.initialize("b.db");
    const initial = store.getState().byDatabase.a;
    expect(initial.views[0]).toMatchObject({ name: "所有卡片", type: "table" });
    expect(initial.columnWidths).toEqual({});
    actions.updateView("a.db", initial.views[0].id, { name: "A 独立视图" });
    actions.setColumnWidth("a", "title", 480);
    expect(store.getState().byDatabase.a.columnWidths.title).toBe(480);
    expect(store.getState().byDatabase.b.views[0].name).toBe("所有卡片");
    expect(store.getState().byDatabase.b.columnWidths).toEqual({});
  });

  it("当前库配置在重建后能够恢复", () => {
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({
        version: 2,
        state: {
          byDatabase: {
            a: { views: [view(22, "新配置")], activeViewId: 22, columnWidths: { title: 500 } },
          },
        },
      })
    );
    const store = createCardDatabasePreferencesStore(localStorage);
    store.getState().initialize("a");
    expect(store.getState().byDatabase.a).toMatchObject({
      views: [{ id: 22, name: "新配置" }],
      columnWidths: { title: 500 },
    });
    const recreated = createCardDatabasePreferencesStore(localStorage);
    expect(recreated.getState().byDatabase).toEqual(store.getState().byDatabase);
  });

  it("另一窗口尚未收取 storage 事件时，操作合并最新快照而不覆盖别库配置", () => {
    const a = createCardDatabasePreferencesStore(localStorage);
    const b = createCardDatabasePreferencesStore(localStorage);
    a.getState().initialize("a");
    b.getState().initialize("b");
    a.getState().setColumnWidth("a", "title", 480);
    b.getState().setColumnWidth("b", "title", 600);
    const restored = createCardDatabasePreferencesStore(localStorage);
    expect(restored.getState().byDatabase.a.columnWidths.title).toBe(480);
    expect(restored.getState().byDatabase.b.columnWidths.title).toBe(600);
  });

  it("同毫秒新增视图 ID 不冲突，部分/重复/未知顺序不丢现有视图", () => {
    const store = createCardDatabasePreferencesStore(localStorage);
    const actions = store.getState();
    actions.initialize("a");
    const initial = store.getState().byDatabase.a.views[0];
    const first = actions.addView("a", view(initial.id, "第一"));
    const second = actions.addView("a", view(initial.id, "第二"));
    expect(new Set([initial.id, first.id, second.id]).size).toBe(3);
    actions.reorderViews("a", [second.id, second.id, -1]);
    expect(store.getState().byDatabase.a.views.map(item => item.id)).toEqual([
      second.id,
      initial.id,
      first.id,
    ]);
    actions.setActiveViewId("a", second.id);
    actions.deleteView("a", second.id);
    expect(store.getState().byDatabase.a.activeViewId).toBe(initial.id);
  });

  it("当前版本的视图配置原样读取", () => {
    const current = { views: [view(7)], activeViewId: 7, columnWidths: {} };
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({ version: 2, state: { byDatabase: { a: current } } })
    );
    const store = createCardDatabasePreferencesStore(localStorage);
    expect(store.getState().byDatabase.a).toEqual(current);
  });
});
