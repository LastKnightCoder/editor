/**
 * 数据表转 Markdown（D-130）：按字段 model 把列值转成纯文本，
 * 供只读 MCP 数据表工具等非 UI 消费方使用。零 React / DOM 依赖。
 */

import { defaultScalar } from "../core/formula/context";
import { createRowDeriverFromContext } from "../core/formula/derive";
import type { ColumnRef, FormulaContext } from "../core/formula/types";
import type { CellValue, ColumnDef, RowData } from "../types";
import type { DatabaseFieldModel } from "./field-model";
import { toFieldModelMap, type FieldModelRegistry } from "./content-refs";

export interface TableToMarkdownInput {
  columns: readonly ColumnDef[] | null | undefined;
  rows: readonly RowData[] | null | undefined;
  /** 列显示顺序（如视图的 columnOrder）；缺省按 columns 顺序，hidden 列跳过 */
  columnOrder?: readonly string[];
  /** 行显示顺序（如视图的 rowOrder）；缺省按 rows 顺序，未列入的行按原序追加 */
  rowOrder?: readonly string[];
  models: FieldModelRegistry;
  /** 返回行数上限，默认 100；超出截断并置 truncated */
  maxRows?: number;
  /** 单元格文本长度上限，超出截断加「…」，默认 200 */
  maxCellLength?: number;
}

export interface TableToMarkdownResult {
  markdown: string;
  truncated: boolean;
  totalRows: number;
}

const DEFAULT_MAX_ROWS = 100;
const DEFAULT_MAX_CELL_LENGTH = 200;

/** 按字段 model 建立公式求值上下文：valueType/toScalar 取自 model（输入为存储原值） */
function modelFormulaContext(
  columns: readonly ColumnDef[],
  registry: ReadonlyMap<string, DatabaseFieldModel>
): FormulaContext {
  const refs = new Map<string, ColumnRef | null>();
  for (const column of columns) {
    const model = registry.get(column.type);
    const declared = model?.valueType;
    const valueType = typeof declared === "function" ? declared(column) : declared;
    if (!model || !valueType) {
      refs.set(column.id, null);
      continue;
    }
    refs.set(column.id, {
      id: column.id,
      title: column.title,
      valueType,
      read: row => {
        const value = (row as Record<string, unknown>)[column.id] as CellValue;
        return model.toScalar ? model.toScalar(value, column) : defaultScalar(value, valueType);
      },
    });
  }
  return { resolveColumn: columnId => refs.get(columnId) };
}

/** columnOrder 优先、未列入的列按原序追加；hidden 列不输出 */
function orderVisibleColumns(
  columns: readonly ColumnDef[],
  columnOrder?: readonly string[]
): ColumnDef[] {
  const visible = columns.filter(column => column && !column.hidden);
  if (!columnOrder?.length) return visible;
  const byId = new Map(visible.map(column => [column.id, column]));
  const ordered: ColumnDef[] = [];
  for (const id of columnOrder) {
    const column = byId.get(id);
    if (column) {
      ordered.push(column);
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()];
}

/** rowOrder 优先（去重、忽略不存在的 id），未列入的行按原序追加 */
function orderRows(rows: readonly RowData[], rowOrder?: readonly string[]): RowData[] {
  if (!rowOrder?.length) return [...rows];
  const byId = new Map(rows.map(row => [row.id, row]));
  const ordered: RowData[] = [];
  for (const id of rowOrder) {
    const row = byId.get(id);
    if (row) {
      ordered.push(row);
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()];
}

/** 单元格文本：先截断（省略号不占转义序列），再转义 | 与换行 */
function formatCell(text: string, maxCellLength: number): string {
  const clipped = text.length > maxCellLength ? text.slice(0, maxCellLength) + "…" : text;
  return clipped.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

/** 无 model 的列类型：输出原值的 JSON 文本（空值与序列化失败退化为 String） */
function jsonCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 数据表转 Markdown：公式列先按 model 派生再取文本，无 model 的列在表头标注类型 */
export function tableToMarkdown(input: TableToMarkdownInput): TableToMarkdownResult {
  const { columns, rows, columnOrder, rowOrder, models } = input;
  const maxRows = input.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCellLength = input.maxCellLength ?? DEFAULT_MAX_CELL_LENGTH;
  const totalRows = Array.isArray(rows) ? rows.length : 0;
  const empty: TableToMarkdownResult = { markdown: "", truncated: false, totalRows };

  if (!Array.isArray(columns) || !Array.isArray(rows)) return empty;

  const registry = toFieldModelMap(models);
  // 公式值不落库、只在投影中派生：取文本前先按字段 model 的 valueType/toScalar 求值
  const derive = createRowDeriverFromContext(columns, modelFormulaContext(columns, registry));

  const visibleColumns = orderVisibleColumns(columns, columnOrder);
  if (!visibleColumns.length) return empty;

  const orderedRows = orderRows(rows, rowOrder);
  const shownRows = orderedRows.slice(0, maxRows);

  const header = visibleColumns
    .map(column => {
      const model = registry.get(column.type);
      // 无 model 的列类型在表头标注类型，单元格输出原值 JSON 截断文本
      const title = model ? column.title : `${column.title} (${column.type})`;
      return formatCell(title, maxCellLength);
    })
    .join(" | ");
  const separator = visibleColumns.map(() => "---").join(" | ");
  const lines = [`| ${header} |`, `| ${separator} |`];
  for (const source of shownRows) {
    const row = derive ? derive(source) : source;
    const cells = visibleColumns.map(column => {
      const model = registry.get(column.type);
      const value = (row as Record<string, unknown>)[column.id] as CellValue;
      return formatCell(model ? model.toText(value, column) : jsonCellText(value), maxCellLength);
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }

  return {
    markdown: lines.join("\n"),
    truncated: orderedRows.length > shownRows.length,
    totalRows,
  };
}
