import { describe, expect, it } from "vitest";
import { CalendarDays, LayoutGrid, SquareKanban, Table2 } from "lucide-react";
import CalendarView from "../CalendarView";
import GalleryView from "../GalleryView";
import KanbanView from "../KanbanView";
import TableView from "../TableView";
import { builtInViewDefinitions } from "../builtInViews";
import { ViewRegistry } from "../ViewRegistry";

// 与 @tau/shared 的 BUILT_IN_VIEW_TYPES 字面量对账（边界脚本禁止本包运行时导入 shared 值）
const SHARED_BUILT_IN_VIEW_TYPES = ["table", "gallery", "calendar", "kanban"] as const;

describe("内置视图定义", () => {
  it("顺序与名称与创建弹窗的既有展示一致，并与 shared 的内置清单对账", () => {
    expect(builtInViewDefinitions.map(definition => definition.type)).toEqual([
      ...SHARED_BUILT_IN_VIEW_TYPES,
    ]);
    expect(builtInViewDefinitions.map(definition => definition.name)).toEqual([
      "表格",
      "画廊",
      "日历",
      "看板",
    ]);
  });

  it("type 唯一且各视图组件与图标齐备", () => {
    const types = builtInViewDefinitions.map(definition => definition.type);
    expect(new Set(types).size).toBe(types.length);

    const expected = {
      table: { Component: TableView, icon: Table2 },
      gallery: { Component: GalleryView, icon: LayoutGrid },
      calendar: { Component: CalendarView, icon: CalendarDays },
      kanban: { Component: KanbanView, icon: SquareKanban },
    } as const;
    for (const definition of builtInViewDefinitions) {
      expect(definition.Component).toBe(expected[definition.type as "table"].Component);
      expect(definition.icon).toBe(expected[definition.type as "table"].icon);
    }
  });

  it("calendar 声明日期列必需并按选定列生成日历配置", () => {
    const calendar = builtInViewDefinitions.find(definition => definition.type === "calendar")!;
    expect(calendar.requiredColumn).toEqual({
      capability: "date",
      unavailableReason: "需要至少一个日期列",
      columnLabel: "日期列",
      columnPlaceholder: "选择用于日历的日期列",
    });
    expect(calendar.createOptions!("col-date")).toStrictEqual({ dateColumnId: "col-date" });
  });

  it("kanban 声明单选列必需并按选定列生成看板配置", () => {
    const kanban = builtInViewDefinitions.find(definition => definition.type === "kanban")!;
    expect(kanban.requiredColumn).toEqual({
      capability: "singleOption",
      unavailableReason: "需要至少一个单选列",
      columnLabel: "分组列",
      columnPlaceholder: "选择用于看板分组的单选列",
    });
    expect(kanban.createOptions!("col-status")).toStrictEqual({
      groupColumnId: "col-status",
      cardDisplay: { template: "task", showFieldLabels: false },
    });
  });

  it("table 与 gallery 无必需列、无创建配置；gallery/calendar/kanban 有专属配置面板", () => {
    for (const type of ["table", "gallery"] as const) {
      const definition = builtInViewDefinitions.find(item => item.type === type)!;
      expect(definition.requiredColumn).toBeUndefined();
      expect(definition.createOptions).toBeUndefined();
    }
    const table = builtInViewDefinitions.find(item => item.type === "table")!;
    expect(table.OptionsPanel).toBeUndefined();
    for (const type of ["gallery", "calendar", "kanban"] as const) {
      const definition = builtInViewDefinitions.find(item => item.type === type)!;
      expect(definition.OptionsPanel).toBeDefined();
    }
  });
});

describe("ViewRegistry", () => {
  it("注册后可查询，重复注册报错", () => {
    const registry = new ViewRegistry();
    const definition = builtInViewDefinitions[0];
    registry.register(definition);
    expect(registry.get("table")?.name).toBe("表格");
    expect(registry.has("table")).toBe(true);
    expect(() => registry.register(definition)).toThrowError("table");
    expect(() => registry.register({ ...definition, name: "改名" })).toThrowError("table");
  });

  it("list 保持注册顺序，未注册类型查不到", () => {
    const registry = new ViewRegistry();
    registry.registerAll(builtInViewDefinitions);
    expect(registry.list().map(definition => definition.type)).toEqual([
      "table",
      "gallery",
      "calendar",
      "kanban",
    ]);
    expect(registry.get("timeline")).toBeUndefined();
    expect(registry.has("timeline")).toBe(false);
  });
});
