import type {
  ColumnDef,
  RowData,
  FilterGroup,
  TableViewConfig,
  DatabaseQuery,
  CellValue,
  SelectOption,
} from "../types";
import type PluginManager from "../PluginManager";

export interface RowGroup {
  key: string;
  label: string;
  rows: RowData[];
  column: ColumnDef | null;
  value?: CellValue;
}

export interface DatabaseProjection {
  rows: RowData[];
  rowIds: string[];
  columnIds: string[];
  groups: RowGroup[];
  grouped: boolean;
  canReorder: boolean;
}

export const emptyQuery: DatabaseQuery = {
  text: "",
  filters: null,
  searchResults: null,
  grouping: "view",
};

/** 展示与交互共用这一份投影；这里不读取组件、数据库或宿主业务状态。 */
export function projectDatabase(
  rows: RowData[],
  columns: ColumnDef[],
  view: TableViewConfig,
  query: DatabaseQuery,
  plugins: PluginManager,
  viewType = "table"
): DatabaseProjection {
  const columnMap = new Map(columns.map(column => [column.id, column]));
  const matches = (group: FilterGroup | null | undefined, row: RowData): boolean => {
    if (!group?.children?.length) return true;
    const checks = group.children.map(condition => {
      if (condition.type === "group") return matches(condition, row);
      const column = condition.fieldId ? columnMap.get(condition.fieldId) : undefined;
      if (!column || !condition.operator) return true;
      const rule = plugins
        .getPlugin(column.type)
        ?.filters?.find(rule => rule.operator === condition.operator);
      if (!rule) return true;
      try {
        return rule.filter(condition.value ?? null, row, column);
      } catch {
        return true;
      }
    });
    return group.logic === "or" ? checks.some(Boolean) : checks.every(Boolean);
  };
  const results = query.searchResults === null ? null : new Set(query.searchResults);
  const text = query.text.trim();
  const filtered = rows.filter(
    row =>
      (!results || results.has(row.id)) &&
      matches(view.filters, row) &&
      matches(query.filters, row) &&
      (!text ||
        columns.some(column =>
          plugins.executeSearch(column.type, text, row[column.id], column, row)
        ))
  );
  const ranks = new Map((query.searchResults ?? view.rowOrder).map((id, index) => [id, index]));
  const rules =
    query.searchResults === null
      ? [...(view.sorts ?? [])].sort((a, b) => a.priority - b.priority)
      : [];
  const ordered = [...filtered].sort((a, b) => {
    for (const rule of rules) {
      const column = columnMap.get(rule.fieldId);
      if (!column) continue;
      const compared =
        plugins.getPlugin(column.type)?.sort?.({
          a: a[column.id],
          b: b[column.id],
          column,
          direction: rule.direction,
          columnConfig: column.config,
          rowA: a,
          rowB: b,
        }) ?? 0;
      if (compared) return compared;
    }
    return (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) || 0;
  });
  const groupColumn =
    query.grouping === "view" && viewType !== "kanban" && viewType !== "calendar"
      ? columnMap.get(view.groupBy?.fieldId ?? "")
      : undefined;
  let groups: RowGroup[] = [{ key: "__all__", label: "全部", rows: ordered, column: null }];
  if (viewType === "kanban") {
    const column = columnMap.get(view.kanbanConfig?.groupColumnId ?? "");
    if (!column || column.type !== "select") groups = [];
    else {
      const options = (column.config as { options?: SelectOption[] } | undefined)?.options ?? [];
      const optionMap = new Map(options.map(option => [option.id, option]));
      const buckets = new Map(options.map(option => [option.id, [] as RowData[]]));
      const uncategorized: RowData[] = [];
      for (const row of ordered) {
        const bucket = buckets.get(String(row[column.id]));
        (bucket ?? uncategorized).push(row);
      }
      groups = uncategorized.length
        ? [{ key: "__uncategorized__", label: "未分类", rows: uncategorized, column, value: null }]
        : [];
      for (const id of new Set([...(view.kanbanConfig?.columnOrder ?? []), ...optionMap.keys()])) {
        const option = optionMap.get(id);
        if (option)
          groups.push({ key: id, label: option.name, rows: buckets.get(id)!, column, value: id });
      }
    }
  } else if (groupColumn) {
    const buckets = new Map<string, RowData[]>();
    for (const row of ordered) {
      const key = plugins.getPlugin(groupColumn.type)?.getGroupKey?.(row, groupColumn) || "未分组";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }
    groups = [...buckets.keys()]
      .sort((a, b) => (a === "未分组" ? 1 : b === "未分组" ? -1 : a.localeCompare(b, "zh-CN")))
      .map(key => ({ key, label: key, rows: buckets.get(key)!, column: groupColumn }));
  }
  const projectedRows = groups.flatMap(group => group.rows);
  const columnIds = [...new Set([...view.columnOrder, ...columns.map(column => column.id)])].filter(
    id => columnMap.has(id) && !columnMap.get(id)!.hidden
  );
  return {
    rows: projectedRows,
    rowIds: projectedRows.map(row => row.id),
    columnIds,
    groups,
    grouped: Boolean(groupColumn) || viewType === "kanban",
    canReorder: query.searchResults === null && rules.length === 0,
  };
}
