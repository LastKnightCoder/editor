import { describe, expect, it } from "vitest";
import { ColumnDef, KanbanViewConfig } from "../../../types";
import { getTemplateDefaultCardDisplay, resolveKanbanCardDisplay } from "../cardDisplayConfig";

const columns: ColumnDef[] = [
  { id: "title", title: "标题", type: "text", isPrimary: true },
  { id: "status", title: "状态", type: "select" },
  { id: "tags", title: "标签", type: "multiSelect" },
  { id: "done", title: "完成", type: "checkbox" },
  { id: "notes", title: "备注", type: "text" },
  { id: "priority", title: "优先级", type: "select" },
  { id: "hiddenText", title: "隐藏字段", type: "text", hidden: true },
  { id: "cover", title: "封面", type: "image" },
];

const viewConfig = {
  columnOrder: ["title", "status", "tags", "done", "notes", "priority", "hiddenText", "cover"],
};

const isBooleanColumn = (column: ColumnDef) => column.type === "checkbox";

describe("cardDisplayConfig", () => {
  it("老配置缺失 cardDisplay 时使用 task 默认配置", () => {
    const result = resolveKanbanCardDisplay({
      columns,
      viewConfig,
      kanban: { groupColumnId: "status" },
      primaryColumnId: "title",
      groupColumnId: "status",
      isBooleanColumn,
    });

    expect(result.template).toBe("task");
    expect(result.showFieldLabels).toBe(false);
    expect(result.doneColumnId).toBe("done");
    expect(result.visibleFieldIds).toEqual(["tags", "priority"]);
  });

  it("doneColumnId 无效时回退到首个 checkbox 列", () => {
    const result = resolveKanbanCardDisplay({
      columns,
      viewConfig,
      kanban: {
        groupColumnId: "status",
        cardDisplay: {
          template: "task",
          doneColumnId: "not-exists",
        },
      },
      primaryColumnId: "title",
      groupColumnId: "status",
      isBooleanColumn,
    });

    expect(result.doneColumnId).toBe("done");
  });

  it("模板切换后可重置为模板默认字段集合", () => {
    const preset = getTemplateDefaultCardDisplay({
      template: "detail",
      columns,
      viewConfig,
      primaryColumnId: "title",
      groupColumnId: "status",
      doneColumnId: "done",
    });

    expect(preset.template).toBe("detail");
    expect(preset.visibleFieldIds).toEqual(["tags", "notes", "priority"]);
  });

  it("会清理无效字段 id 并过滤不支持类型", () => {
    const kanban: KanbanViewConfig = {
      groupColumnId: "status",
      cardDisplay: {
        template: "detail",
        visibleFieldIds: ["cover", "missing", "priority", "notes"],
      },
    };

    const result = resolveKanbanCardDisplay({
      columns,
      viewConfig,
      kanban,
      primaryColumnId: "title",
      groupColumnId: "status",
      isBooleanColumn,
    });

    expect(result.visibleFieldIds).toEqual(["notes", "priority"]);
  });
});
