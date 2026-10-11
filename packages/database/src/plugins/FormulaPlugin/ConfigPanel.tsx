import React, { useState } from "react";
import type { FieldConfigPanelProps, FieldConfigValidationContext } from "../../types";
import type { FormulaColumnConfig } from "@tau/shared/database-types";
import FormulaBuilder from "../../components/FormulaBuilder";
import { checkFormula, createFormContext, type Draft } from "../../components/FormulaBuilder/check";
import {
  exprToForm,
  formToExpr,
  hasHole,
  type FormulaForm,
} from "../../components/FormulaBuilder/model";

const labelClass = "text-tau-meta font-medium text-ink-2";

/** 公式字段的配置面板：构造器草稿经 onChange 写回 { expr（可含空位）, output }，保存时再整体校验 */
const FormulaConfigPanel: React.FC<FieldConfigPanelProps<FormulaColumnConfig>> = ({
  config,
  onChange,
  column,
  columns,
  rows,
  pluginManager,
  title,
  error,
  setError,
}) => {
  const [formula, setFormula] = useState<FormulaForm>(() =>
    column && config?.expr
      ? exprToForm(config.expr, config.output, createFormContext(columns, pluginManager, "row"))
      : null
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>公式</span>
      <FormulaBuilder
        scope="row"
        value={formula}
        onChange={next => {
          setFormula(next);
          setError(null);
          onChange({
            expr: formToExpr(next, "row") as FormulaColumnConfig["expr"],
            output: config?.output ?? "number",
          });
        }}
        columns={columns}
        rows={rows}
        pluginManager={pluginManager}
        selfColumnId={column?.id}
        resultLabel={title}
        error={error}
      />
    </div>
  );
};

/** 保存前的完整校验（原 ColumnEditModal 的公式保存分支）：空位、结构、类型与成环 */
export function validateFormulaConfig(
  config: FormulaColumnConfig | undefined,
  ctx: FieldConfigValidationContext
): { ok: true; config: FormulaColumnConfig } | { ok: false; message: string } {
  if (!config?.expr) return { ok: false, message: "先选择要计算的内容" };
  const expr = config.expr as Draft;
  if (hasHole(expr)) return { ok: false, message: "还有没填完的地方" };
  const check = checkFormula(expr, "row", ctx.columns, ctx.rows, ctx.pluginManager, ctx.column?.id);
  if (!check.ok || expr.kind === "hole")
    return { ok: false, message: check.ok ? "还有没填完的地方" : check.message };
  return { ok: true, config: { expr, output: check.output } };
}

/** 公式构造器需要更宽的弹窗 */
const FormulaConfigPanelWithWidth = Object.assign(FormulaConfigPanel, { dialogWidth: 880 });

export default FormulaConfigPanelWithWidth;
