import type PluginManager from "../../PluginManager";
import type { ColumnDef, RowData } from "../../types";
import {
  createFormulaContext,
  evaluateFooter,
  FORMULA_TYPE,
  formatScalar,
  orderFormulaColumns,
  validateFormula,
  type Expr,
  type FormulaScope,
  type ValueType,
} from "../../core/formula";
import type { FormContext } from "./model";

/** 构造器里的草稿：比表达式多一个「还没填」的空位 */
export type Draft = Expr | { kind: "hole" };

export type FormulaCheck =
  { ok: true; output: ValueType; footerText: string } | { ok: false; message: string };

/** 把候选公式放进列定义里（替换或追加），用于成环检测与预览 */
export function formulaColumnsWith(
  columns: ColumnDef[],
  columnId: string,
  expr: Expr,
  output: ValueType
): ColumnDef[] {
  const candidate: ColumnDef = {
    ...(columns.find(column => column.id === columnId) ?? { id: columnId, title: "" }),
    type: FORMULA_TYPE,
    config: { expr, output },
  };
  return columns.some(column => column.id === columnId)
    ? columns.map(column => (column.id === columnId ? candidate : column))
    : [...columns, candidate];
}

/** 保存前的完整检查：结构、类型、成环；footer 作用域顺带算出预览值 */
export function checkFormula(
  draft: Draft,
  scope: FormulaScope,
  columns: ColumnDef[],
  rows: RowData[],
  plugins: PluginManager,
  selfColumnId?: string
): FormulaCheck {
  if (draft.kind === "hole") return { ok: false, message: "先选择要计算的内容" };
  const ctx = createFormulaContext(columns, plugins);
  if (scope === "footer") {
    const result = evaluateFooter("", { kind: "expr", expr: draft }, rows, ctx);
    if (!result.ok) return { ok: false, message: result.error.message };
    const { value } = result.value;
    const output = result.value.kind === "expr" ? result.value.valueType : "number";
    return { ok: true, output, footerText: formatScalar(value, output) || "—" };
  }
  const valid = validateFormula(draft, ctx);
  if (!valid.ok) return { ok: false, message: valid.error.message };
  if (selfColumnId) {
    const { cyclic } = orderFormulaColumns(
      formulaColumnsWith(columns, selfColumnId, draft, valid.value)
    );
    if (cyclic.has(selfColumnId)) return { ok: false, message: "公式之间互相引用了" };
  }
  return { ok: true, output: valid.value, footerText: "" };
}

/** 表单还原所需的列信息：select 单独成类，以便条件里选择选项 */
export function createFormContext(
  columns: ColumnDef[],
  plugins: PluginManager,
  scope: FormulaScope
): FormContext {
  const ctx = createFormulaContext(columns, plugins);
  return {
    scope,
    familyOf: columnId => {
      if (columns.find(column => column.id === columnId)?.type === "select") return "select";
      return ctx.resolveColumn(columnId)?.valueType;
    },
  };
}
