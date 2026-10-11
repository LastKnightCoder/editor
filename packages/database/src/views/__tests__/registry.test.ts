import { describe, expect, it } from "vitest";
import { CalendarDays, LayoutGrid, SquareKanban, Table2 } from "lucide-react";
import CalendarView from "../CalendarView";
import GalleryView from "../GalleryView";
import KanbanView from "../KanbanView";
import TableView from "../TableView";
import { VIEW_TYPES, getViewType } from "../registry";
import { getViewComponent } from "../components";

describe("视图类型注册表", () => {
  it("顺序与名称与创建弹窗的既有展示一致", () => {
    expect(VIEW_TYPES.map(definition => definition.type)).toEqual([
      "table",
      "gallery",
      "calendar",
      "kanban",
    ]);
    expect(VIEW_TYPES.map(definition => definition.name)).toEqual(["表格", "画廊", "日历", "看板"]);
  });

  it("type 唯一且各视图组件与图标齐备", () => {
    const types = VIEW_TYPES.map(definition => definition.type);
    expect(new Set(types).size).toBe(types.length);

    const expected = {
      table: { Component: TableView, icon: Table2 },
      gallery: { Component: GalleryView, icon: LayoutGrid },
      calendar: { Component: CalendarView, icon: CalendarDays },
      kanban: { Component: KanbanView, icon: SquareKanban },
    } as const;
    for (const definition of VIEW_TYPES) {
      expect(getViewComponent(definition.type)).toBe(expected[definition.type].Component);
      expect(definition.icon).toBe(expected[definition.type].icon);
    }
  });

  it("getViewType 命中已注册类型，未知类型返回 undefined", () => {
    expect(getViewType("table")?.name).toBe("表格");
    expect(getViewType("timeline")).toBeUndefined();
  });

  it("calendar 声明日期列必需并按选定列生成日历配置", () => {
    const calendar = getViewType("calendar")!;
    expect(calendar.requiredColumn).toEqual({
      capability: "date",
      unavailableReason: "需要至少一个日期列",
      columnLabel: "日期列",
      columnPlaceholder: "选择用于日历的日期列",
    });
    expect(calendar.createConfig!("col-date")).toStrictEqual({
      calendarConfig: { dateColumnId: "col-date" },
    });
  });

  it("kanban 声明单选列必需并按选定列生成看板配置", () => {
    const kanban = getViewType("kanban")!;
    expect(kanban.requiredColumn).toEqual({
      capability: "singleOption",
      unavailableReason: "需要至少一个单选列",
      columnLabel: "分组列",
      columnPlaceholder: "选择用于看板分组的单选列",
    });
    expect(kanban.createConfig!("col-status")).toStrictEqual({
      kanbanConfig: {
        groupColumnId: "col-status",
        cardDisplay: { template: "task", showFieldLabels: false },
      },
    });
  });

  it("table 与 gallery 无必需列、无创建配置", () => {
    for (const type of ["table", "gallery"] as const) {
      const definition = getViewType(type)!;
      expect(definition.requiredColumn).toBeUndefined();
      expect(definition.createConfig).toBeUndefined();
    }
  });
});
