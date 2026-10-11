import { SquareKanban } from "lucide-react";
import KanbanView from ".";
import OptionsPanel from "./OptionsPanel";
import type { DatabaseViewDefinition, RowGroup, ViewGroupingContext } from "../types";
import type { KanbanViewConfig, SelectOption } from "../../types";

/** 看板分桶：按 viewOptions.kanban 的分组列选项建组，未命中进「未分类」，列序按配置的 columnOrder */
const groupKanbanRows = ({
  rows,
  columnMap,
  options,
  plugins,
}: ViewGroupingContext<KanbanViewConfig>): RowGroup[] => {
  const column = columnMap.get(options?.groupColumnId ?? "");
  if (!column || !plugins.hasCapability(column.type, "singleOption")) return [];
  const selectOptions = (column.config as { options?: SelectOption[] } | undefined)?.options ?? [];
  const optionMap = new Map(selectOptions.map(option => [option.id, option]));
  const buckets = new Map(selectOptions.map(option => [option.id, [] as typeof rows]));
  const uncategorized: typeof rows = [];
  for (const row of rows) {
    const bucket = buckets.get(String(row[column.id]));
    (bucket ?? uncategorized).push(row);
  }
  const groups: RowGroup[] = uncategorized.length
    ? [{ key: "__uncategorized__", label: "未分类", rows: uncategorized, column, value: null }]
    : [];
  for (const id of new Set([...(options?.columnOrder ?? []), ...optionMap.keys()])) {
    const option = optionMap.get(id);
    if (option)
      groups.push({ key: id, label: option.name, rows: buckets.get(id)!, column, value: id });
  }
  return groups;
};

/** 看板视图：创建需选定单选列，分组由本视图自带（projection 输出选项分桶） */
export const kanbanViewDefinition: DatabaseViewDefinition<KanbanViewConfig> = {
  type: "kanban",
  name: "看板",
  icon: SquareKanban,
  Component: KanbanView,
  requiredColumn: {
    capability: "singleOption",
    unavailableReason: "需要至少一个单选列",
    columnLabel: "分组列",
    columnPlaceholder: "选择用于看板分组的单选列",
  },
  createOptions: columnId =>
    columnId
      ? {
          groupColumnId: columnId,
          cardDisplay: { template: "task", showFieldLabels: false },
        }
      : undefined,
  OptionsPanel,
  grouping: groupKanbanRows,
};
