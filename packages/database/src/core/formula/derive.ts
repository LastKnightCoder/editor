import dayjs from "dayjs";
import type { FormulaColumnConfig } from "@tau/shared/database-types";
import type PluginManager from "../../PluginManager";
import { SELECT_COLORS } from "../../constants";
import type { ColumnDef, RowData } from "../../types";
import { createFormulaContext } from "./context";
import { evaluateExpr } from "./evaluate";
import type { Expr, FormulaContext, Scalar, ValueType } from "./types";
import { referencedColumns, validateFormula } from "./validate";

export const FORMULA_TYPE = "formula";

/** 公式列在派生行里的值：只存在于投影，不进存储 */
export interface FormulaCellValue {
  value: Scalar;
  /** 算不出来时给用户的一句话原因 */
  error?: string;
}

export const isFormulaCell = (value: unknown): value is FormulaCellValue =>
  typeof value === "object" && value !== null && "value" in value && !Array.isArray(value);

export const formulaConfigOf = (column: ColumnDef): Partial<FormulaColumnConfig> =>
  (column.config as Partial<FormulaColumnConfig> | undefined) ?? {};

/** 标量的展示文本；数字最多两位小数，日期到天 */
export function formatScalar(value: Scalar, valueType: ValueType | undefined): string {
  if (value === null) return "";
  if (valueType === "date" && typeof value === "number") return dayjs(value).format("YYYY-MM-DD");
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (typeof value === "boolean") return value ? "是" : "否";
  return value;
}

/** 公式列的依赖顺序；互相引用（含自引用）的列单独列出 */
export function orderFormulaColumns(columns: readonly ColumnDef[]): {
  order: ColumnDef[];
  cyclic: Set<string>;
} {
  const formulas = new Map(
    columns.filter(column => column.type === FORMULA_TYPE).map(column => [column.id, column])
  );
  const order: ColumnDef[] = [];
  const cyclic = new Set<string>();
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]): void => {
    const column = formulas.get(id);
    if (!column) return;
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      path.slice(path.indexOf(id)).forEach(member => cyclic.add(member));
      return;
    }
    state.set(id, "visiting");
    const expr = formulaConfigOf(column).expr;
    if (expr && typeof expr === "object") {
      for (const dependency of referencedColumns(expr)) visit(dependency, [...path, id]);
    }
    state.set(id, "done");
    order.push(column);
  };
  formulas.forEach((_, id) => visit(id, []));
  return { order: order.filter(column => !cyclic.has(column.id)), cyclic };
}

type RowDeriver = (row: RowData) => RowData;

/**
 * 给行补上公式列的值。表达式在建立时校验一次；
 * 同一源行对象复用同一派生结果，未改动的行不重算、引用稳定。
 */
function createRowDeriver(
  columns: readonly ColumnDef[],
  plugins: PluginManager
): RowDeriver | null {
  if (!columns.some(column => column.type === FORMULA_TYPE)) return null;
  const ctx: FormulaContext = createFormulaContext(columns, plugins);
  const { order, cyclic } = orderFormulaColumns(columns);
  const fixed = new Map<string, FormulaCellValue>();
  for (const id of cyclic) fixed.set(id, { value: null, error: "公式之间互相引用了" });
  const runnable = order.flatMap(column => {
    const { expr } = formulaConfigOf(column);
    const valid = validateFormula(expr, ctx);
    if (!valid.ok || !expr) {
      fixed.set(column.id, {
        value: null,
        error: valid.ok ? "还有没填完的地方" : valid.error.message,
      });
      return [];
    }
    return [{ id: column.id, expr }];
  });

  const cache = new WeakMap<RowData, RowData>();
  return row => {
    const cached = cache.get(row);
    if (cached) return cached;
    const derived: RowData = { ...row };
    fixed.forEach((value, id) => (derived[id] = value));
    for (const { id, expr } of runnable) {
      const result = evaluateExpr(expr, derived, ctx);
      derived[id] = result.ok
        ? { value: result.value }
        : { value: null, error: result.error.message };
    }
    cache.set(row, derived);
    return derived;
  };
}

const derivers = new WeakMap<
  readonly ColumnDef[],
  { plugins: PluginManager; derive: RowDeriver | null }
>();

/** 按列定义取派生器；列定义数组不变时复用（store 的列与行均为不可变更新） */
export function getRowDeriver(
  columns: readonly ColumnDef[],
  plugins: PluginManager
): RowDeriver | null {
  const cached = derivers.get(columns);
  if (cached && cached.plugins === plugins) return cached.derive;
  const derive = createRowDeriver(columns, plugins);
  derivers.set(columns, { plugins, derive });
  return derive;
}

export function deriveFormulaRows(
  rows: RowData[],
  columns: readonly ColumnDef[],
  plugins: PluginManager
): RowData[] {
  const derive = getRowDeriver(columns, plugins);
  return derive ? rows.map(derive) : rows;
}

/**
 * 「按条件显示」且每个结果都是固定文字时，结果像单选一样是一组枚举：
 * 返回按情况顺序去重的取值，供标签着色与排序；否则返回 null。
 */
export function formulaEnumOf(expr: unknown): string[] | null {
  let node = expr as Expr | undefined;
  if (node?.kind !== "if") return null;
  const values: string[] = [];
  const take = (leaf: Expr) => {
    if (leaf.kind !== "literal") return false;
    if (typeof leaf.value === "string") values.push(leaf.value);
    return typeof leaf.value === "string" || leaf.value === null;
  };
  while (node.kind === "if") {
    if (!take(node.then)) return null;
    node = node.else;
  }
  if (!take(node)) return null;
  const distinct = [...new Set(values.filter(Boolean))];
  return distinct.length ? distinct : null;
}

const enums = new WeakMap<object, string[] | null>();

/** 列的枚举型结果，按列配置缓存 */
export function formulaEnumOfColumn(column: ColumnDef): string[] | null {
  const config = column.config as object | undefined;
  if (!config || formulaConfigOf(column).output !== "text") return null;
  if (!enums.has(config)) enums.set(config, formulaEnumOf(formulaConfigOf(column).expr));
  return enums.get(config) ?? null;
}

/** 枚举值的标签色：按情况顺序取单选同一套色板，同一个词恒定同色 */
export function enumTagColor(values: readonly string[] | null, value: Scalar) {
  const index = values && typeof value === "string" ? values.indexOf(value) : -1;
  return index < 0 ? null : SELECT_COLORS[index % SELECT_COLORS.length];
}

export const formulaTagColor = (column: ColumnDef, value: Scalar) =>
  enumTagColor(formulaEnumOfColumn(column), value);
