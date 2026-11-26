import type { ColumnDef, RowData, DatabaseView, TableViewConfig } from "@tau/database";
import type { QueryResult } from "@tau/shared/query-database";

export interface QueryPresentation {
  views: DatabaseView[];
  activeViewId: number;
}
export function queryViewReferences(config: TableViewConfig): Set<string> {
  const refs = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ["fieldId", "dateColumnId", "groupColumnId", "doneColumnId"].includes(key) &&
        typeof child === "string"
      )
        refs.add(child);
      else visit(child);
    }
  };
  visit([config.filters, config.sorts, config.groupBy, config.viewOptions]);
  return refs;
}
export function initialQueryPresentation(): QueryPresentation {
  return {
    activeViewId: 1,
    views: [
      {
        id: 1,
        name: "表格",
        type: "table",
        order: 0,
        config: {
          columnOrder: [],
          rowOrder: [],
          sorts: [],
          filters: null,
          groupBy: null,
        },
      },
    ],
  };
}
/** 查询列只读、内容可预期，按类型给紧凑默认宽度，少出横向滚动 */
const COLUMN_WIDTH: Partial<Record<QueryResult["columns"][number]["type"], number>> = {
  boolean: 80,
  number: 100,
  date: 130,
  select: 130,
  multiSelect: 180,
};

export function toQueryDataset(result: QueryResult): {
  columns: ColumnDef[];
  rows: RowData[];
} {
  const columns = result.columns.map((column, index): ColumnDef => {
    const options = new Set(column.options ?? []);
    if (column.type === "select" || column.type === "multiSelect")
      for (const row of result.rows) {
        const value = row.values[column.key];
        if (typeof value === "string") options.add(value);
        if (Array.isArray(value))
          for (const item of value) if (typeof item === "string") options.add(item);
      }
    return {
      id: `q:${column.key}`,
      title: column.title,
      type:
        column.type === "boolean"
          ? "checkbox"
          : column.type === "entity"
            ? "queryEntity"
            : column.type === "json"
              ? "text"
              : column.type,
      readonly: true,
      isPrimary: index === 0,
      width: index === 0 ? 240 : (COLUMN_WIDTH[column.type] ?? 160),
      ...(column.type === "select" || column.type === "multiSelect"
        ? {
            config: {
              options: [...options].map(name => ({
                id: name,
                name,
                color: "blue",
              })),
            },
          }
        : {}),
    };
  });
  const rows = result.rows.map(row => {
    const output: RowData = { id: row.id };
    for (const column of result.columns) {
      const value = row.values[column.key];
      output[`q:${column.key}`] =
        column.type === "date" && value !== null
          ? {
              start:
                typeof value === "number"
                  ? value
                  : /^\d{4}-\d{2}-\d{2}$/.test(String(value))
                    ? new Date(String(value) + "T00:00:00").getTime()
                    : Date.parse(String(value)),
              end: null,
            }
          : column.type === "json" && value !== null
            ? JSON.stringify(value)
            : value;
    }
    return output;
  });
  return { columns, rows };
}
export function changePresentationConfig(
  state: QueryPresentation,
  config: TableViewConfig
): QueryPresentation {
  return {
    ...state,
    views: state.views.map(view => (view.id === state.activeViewId ? { ...view, config } : view)),
  };
}
