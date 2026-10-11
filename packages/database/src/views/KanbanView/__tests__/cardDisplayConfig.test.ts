import { describe, expect, it } from "vitest";
import { CellPlugin, ColumnDef, KanbanViewConfig } from "../../../types";
import { PluginManager } from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import {
  createCardFieldPredicate,
  getTemplateDefaultCardDisplay,
  resolveKanbanCardDisplay,
} from "../cardDisplayConfig";

const columns: ColumnDef[] = [
  { id: "title", title: "标题", type: "text", isPrimary: true },
  { id: "status", title: "状态", type: "select", config: { options: [] } },
  { id: "tags", title: "标签", type: "multiSelect", config: { options: [] } },
  { id: "done", title: "完成", type: "checkbox" },
  { id: "notes", title: "备注", type: "text" },
  { id: "priority", title: "优先级", type: "select", config: { options: [] } },
  { id: "hiddenText", title: "隐藏字段", type: "text", hidden: true },
  { id: "cover", title: "封面", type: "image" },
];

const viewConfig = {
  columnOrder: ["title", "status", "tags", "done", "notes", "priority", "hiddenText", "cover"],
};

const isBooleanColumn = (column: ColumnDef) => column.type === "checkbox";
// 与测试列集配套的展示判定：内置可展示类型为 true，未注册插件（image）为 false
const isCardField = (column: ColumnDef) => column.type !== "image";

describe("cardDisplayConfig", () => {
  it("老配置缺失 cardDisplay 时使用 task 默认配置", () => {
    const result = resolveKanbanCardDisplay({
      columns,
      viewConfig,
      kanban: { groupColumnId: "status" },
      primaryColumnId: "title",
      groupColumnId: "status",
      isBooleanColumn,
      isCardField,
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
      isCardField,
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
      isCardField,
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
      isCardField,
    });

    expect(result.visibleFieldIds).toEqual(["notes", "priority"]);
  });

  it("卡片字段与优先级识别基于声明，内置字段结果与旧类型白名单一致", () => {
    // 旧实现的类型白名单：卡片可展示 9 类；优先级 = select / multiSelect
    const legacySupported = new Set([
      "text",
      "number",
      "date",
      "select",
      "multiSelect",
      "checkbox",
      "star",
      "progress",
      "link",
    ]);
    const pluginManager = new PluginManager();
    pluginManager.registerPlugins(builtInPlugins as unknown as CellPlugin<unknown>[]);
    const predicate = createCardFieldPredicate(pluginManager);

    const allBuiltIn = (builtInPlugins as readonly CellPlugin<any>[]).map(item => ({
      id: `col-${item.type}`,
      title: item.name,
      type: item.type,
    })) as ColumnDef[];

    for (const column of allBuiltIn) {
      expect(predicate(column), column.type).toBe(legacySupported.has(column.type));
    }

    // 优先级识别：选项类字段（config 带 options 数组）排前，等价于旧 select/multiSelect 集合
    const withOptions = allBuiltIn.map(column =>
      column.type === "select" || column.type === "multiSelect"
        ? { ...column, config: { options: [] } }
        : column
    );
    const result = resolveKanbanCardDisplay({
      columns: withOptions,
      viewConfig: { columnOrder: withOptions.map(column => column.id) },
      kanban: { groupColumnId: "col-select" },
      primaryColumnId: undefined,
      groupColumnId: "col-select",
      isBooleanColumn: () => false,
      isCardField: predicate,
    });
    // 分组列（select）被排除后，task 模板默认取 multiSelect 与其后首个非选项字段
    expect(result.visibleFieldIds).toEqual(["col-multiSelect", "col-text"]);
  });
});
