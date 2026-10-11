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
const legacy = () => ({
  state: { views: [view(11)], activeViewId: 11, columnWidths: { title: 320 } },
  version: 0,
});
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("卡片数据库视图偏好", () => {
  it("完整保留旧模板、视图和列宽，各库首次继承后独立修改", () => {
    const previous = legacy();
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({ version: 1, state: { byDatabase: {}, legacyDefaults: previous.state } })
    );
    const store = createCardDatabasePreferencesStore(localStorage);
    const actions = store.getState();
    actions.initialize("a");
    actions.initialize("b.db");
    expect(store.getState().legacyDefaults).toEqual(previous.state);
    expect(store.getState().byDatabase.a).toEqual(previous.state);
    expect(store.getState().byDatabase.b).toEqual(previous.state);
    expect(store.getState().byDatabase.a.views[0].config).not.toBe(
      store.getState().byDatabase.b.views[0].config
    );
    actions.updateView("a.db", 11, { name: "A 独立视图" });
    actions.setColumnWidth("a", "title", 480);
    expect(store.getState().byDatabase.a).toMatchObject({
      views: [{ name: "A 独立视图" }],
      columnWidths: { title: 480 },
    });
    expect(store.getState().byDatabase.b).toEqual(previous.state);
    actions.initialize("c");
    expect(store.getState().byDatabase.c).toEqual(previous.state);
  });

  it("已有库配置优先，旧模板不会覆盖新配置，重建后能够恢复", () => {
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        state: {
          byDatabase: {
            a: { views: [view(22, "新配置")], activeViewId: 22, columnWidths: { title: 500 } },
          },
          legacyDefaults: null,
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

  it("v1 存量视图配置的旧三键按开库升级同规则迁入 viewOptions", () => {
    const legacyView = (id: number) => ({
      id,
      tableId: 0,
      name: "旧视图",
      type: "gallery",
      order: 0,
      createTime: 10,
      updateTime: 20,
      config: {
        columnOrder: ["title"],
        rowOrder: [],
        sorts: [],
        filters: null,
        groupBy: null,
        galleryConfig: { coverType: "image", coverImageColumnId: "cover" },
        calendarConfig: {},
        kanbanConfig: null,
      },
    });
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        state: {
          byDatabase: {
            a: {
              views: [
                legacyView(1),
                {
                  ...legacyView(2),
                  config: {
                    ...legacyView(2).config,
                    viewOptions: { gallery: { coverType: "detail" } },
                  },
                },
              ],
              activeViewId: 1,
              columnWidths: {},
            },
          },
          legacyDefaults: { views: [legacyView(3)], activeViewId: 3, columnWidths: {} },
        },
      })
    );
    const store = createCardDatabasePreferencesStore(localStorage);
    const migrated = store.getState().byDatabase.a.views[0].config;
    expect(migrated).toEqual({
      columnOrder: ["title"],
      rowOrder: [],
      sorts: [],
      filters: null,
      groupBy: null,
      // 只移动非空对象；已有同名子键（视图 2）以已有为准；空对象/非对象旧键删除不迁移
      viewOptions: { gallery: { coverType: "image", coverImageColumnId: "cover" } },
    });
    expect(store.getState().byDatabase.a.views[1].config.viewOptions).toEqual({
      gallery: { coverType: "detail" },
    });
    expect(store.getState().legacyDefaults?.views[0].config.viewOptions).toEqual({
      gallery: { coverType: "image", coverImageColumnId: "cover" },
    });
  });

  it("已是当前版本（v2）的状态不重复迁移", () => {
    const current = { views: [view(7)], activeViewId: 7, columnWidths: {} };
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({ version: 2, state: { byDatabase: { a: current }, legacyDefaults: null } })
    );
    const store = createCardDatabasePreferencesStore(localStorage);
    expect(store.getState().byDatabase.a).toEqual(current);
  });
});
