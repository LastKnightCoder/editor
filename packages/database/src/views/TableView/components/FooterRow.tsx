import React, { memo, useMemo, useState } from "react";
import { Button, Dialog, DialogBody, Menu } from "@tau/ui";
import type PluginManager from "../../../PluginManager";
import type { AggregateOp, ColumnDef, FooterSpec, RowData } from "../../../types";
import {
  AGGREGATE_LABELS,
  aggregatesFor,
  createFormulaContext,
  evaluateFooter,
  formatScalar,
  type FormulaContext,
} from "../../../core/formula";
import FormulaBuilder from "../../../components/FormulaBuilder";
import { checkFormula, createFormContext } from "../../../components/FormulaBuilder/check";
import {
  exprToForm,
  formToExpr,
  hasHole,
  type FormulaForm,
} from "../../../components/FormulaBuilder/model";

interface FooterRowProps {
  columns: ColumnDef[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  /** 投影后（筛选后）的行 */
  rows: RowData[];
  footer: Record<string, FooterSpec> | undefined;
  pluginManager: PluginManager;
  readonly: boolean;
  onChange: (columnId: string, spec: FooterSpec | null) => void;
}

const COUNT_OPS = new Set<AggregateOp>(["countAll", "countNonEmpty", "countEmpty", "unique"]);
const FORMULA_OPTION = "formula";

function formatResult(
  column: ColumnDef,
  spec: FooterSpec,
  rows: RowData[],
  ctx: FormulaContext,
  pluginManager: PluginManager
): { text: string; title?: string } {
  const result = evaluateFooter(column.id, spec, rows, ctx);
  if (!result.ok) return { text: "—", title: result.error.message };
  const footer = result.value;
  if (footer.value === null) return { text: "—" };
  if (footer.kind === "expr") return { text: formatScalar(footer.value, footer.valueType) };
  if (footer.kind === "count") return { text: String(footer.value) };
  const format = pluginManager.getPlugin(column.type)?.formatScalar;
  return { text: format ? format(footer.value, column) : formatScalar(footer.value, "number") };
}

/** 表尾组合公式：叶子是各列的汇总，例如「小计 · 求和 × 汇率」 */
const FooterFormulaDialog: React.FC<{
  open: boolean;
  column: ColumnDef;
  spec: FooterSpec | undefined;
  columns: ColumnDef[];
  rows: RowData[];
  pluginManager: PluginManager;
  onClose: () => void;
  onSave: (spec: FooterSpec) => void;
}> = ({ open, column, spec, columns, rows, pluginManager, onClose, onSave }) => {
  // 没有组合公式时从本列的汇总开始，用户再往后加项
  const initial = (): FormulaForm => {
    if (spec?.kind === "expr")
      return exprToForm(spec.expr, undefined, createFormContext(columns, pluginManager, "footer"));
    const ctx = createFormulaContext(columns, pluginManager);
    const op = spec?.op ?? aggregatesFor(ctx.resolveColumn(column.id)?.valueType ?? null)[0];
    return { kind: "calc", terms: [{ value: { kind: "column", columnId: column.id, agg: op } }] };
  };
  const [form, setForm] = useState<FormulaForm>(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      onAfterClose={() => {
        setForm(initial());
        setError(null);
      }}
      title="表尾公式"
      context={column.title}
      width={720}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (form?.kind === "unsupported" && spec?.kind === "expr") return onClose();
              const expr = formToExpr(form, "footer");
              if (hasHole(expr) || expr.kind === "hole") {
                setError("还有没填完的地方");
                return;
              }
              const check = checkFormula(expr, "footer", columns, rows, pluginManager);
              if (!check.ok) {
                setError(check.message);
                return;
              }
              onSave({ kind: "expr", expr });
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <DialogBody>
        <FormulaBuilder
          scope="footer"
          value={form}
          onChange={next => {
            setForm(next);
            setError(null);
          }}
          columns={columns}
          rows={rows}
          pluginManager={pluginManager}
          error={error}
        />
      </DialogBody>
    </Dialog>
  );
};

const FooterCell: React.FC<{
  column: ColumnDef;
  columns: ColumnDef[];
  width: number;
  spec: FooterSpec | undefined;
  rows: RowData[];
  ctx: FormulaContext;
  pluginManager: PluginManager;
  readonly: boolean;
  onChange: FooterRowProps["onChange"];
}> = memo(({ column, columns, width, spec, rows, ctx, pluginManager, readonly, onChange }) => {
  const [open, setOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const display = useMemo(
    () => (spec ? formatResult(column, spec, rows, ctx, pluginManager) : null),
    [column, spec, rows, ctx, pluginManager]
  );
  const ops = aggregatesFor(ctx.resolveColumn(column.id)?.valueType ?? null);
  const label = spec ? (spec.kind === "expr" ? "公式" : AGGREGATE_LABELS[spec.op]) : null;

  const content = (
    <span className="flex min-w-0 items-baseline justify-end gap-1.5">
      {label && display ? (
        <>
          <span className="text-ink-3 text-tau-tiny shrink-0">{label}</span>
          <span className="text-ink-1 truncate tabular-nums" title={display.title}>
            {display.text}
          </span>
        </>
      ) : (
        <span className="text-ink-3 opacity-0 transition-opacity group-hover/footer:opacity-100">
          汇总
        </span>
      )}
    </span>
  );

  const radio = (op: AggregateOp) => (
    <Menu.RadioItem key={op} value={op}>
      {AGGREGATE_LABELS[op]}
    </Menu.RadioItem>
  );

  return (
    <div
      className="border-line-2 box-border flex h-9 items-center border-r px-1"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {readonly || column.readonly ? (
        display && <div className="text-tau-sm w-full px-2">{content}</div>
      ) : (
        <>
          <Menu
            align="end"
            open={open}
            onOpenChange={setOpen}
            trigger={
              <button
                type="button"
                className="text-tau-sm hover:bg-hover rounded-tau-sm flex h-7 w-full cursor-pointer items-center justify-end px-2 transition-colors"
              >
                {content}
              </button>
            }
          >
            <Menu.RadioGroup
              value={spec ? (spec.kind === "expr" ? FORMULA_OPTION : spec.op) : "none"}
              onValueChange={value => {
                setOpen(false);
                if (value === FORMULA_OPTION) {
                  setFormulaOpen(true);
                  return;
                }
                onChange(
                  column.id,
                  value === "none" ? null : { kind: "aggregate", op: value as AggregateOp }
                );
              }}
            >
              <Menu.RadioItem value="none">无</Menu.RadioItem>
              <Menu.Separator />
              {ops.filter(op => !COUNT_OPS.has(op)).map(radio)}
              {ops.some(op => !COUNT_OPS.has(op)) && <Menu.Separator />}
              {ops.filter(op => COUNT_OPS.has(op)).map(radio)}
              <Menu.Separator />
              <Menu.RadioItem value={FORMULA_OPTION}>公式…</Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu>
          <FooterFormulaDialog
            open={formulaOpen}
            column={column}
            spec={spec}
            columns={columns}
            rows={rows}
            pluginManager={pluginManager}
            onClose={() => setFormulaOpen(false)}
            onSave={next => {
              onChange(column.id, next);
              setFormulaOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
});

/** 表尾汇总行：吸底、随列横向滚动；未配置的格悬停才显示「汇总」入口 */
const FooterRow: React.FC<FooterRowProps> = memo(
  ({ columns, columnOrder, columnWidths, rows, footer, pluginManager, readonly, onChange }) => {
    const ctx = useMemo(
      () => createFormulaContext(columns, pluginManager),
      [columns, pluginManager]
    );
    if (readonly && !footer) return null;

    return (
      <div className="group/footer border-line-1 bg-surface sticky bottom-0 z-10 flex w-full min-w-max flex-row border-t">
        <div className="border-line-2 box-border h-9 w-[50px] min-w-[50px] border-r" />
        {columnOrder.map(columnId => {
          const column = columns.find(col => col.id === columnId);
          if (!column) return null;
          return (
            <FooterCell
              key={columnId}
              column={column}
              columns={columns}
              width={columnWidths[columnId] || 200}
              spec={footer?.[columnId]}
              rows={rows}
              ctx={ctx}
              pluginManager={pluginManager}
              readonly={readonly}
              onChange={onChange}
            />
          );
        })}
        <div className="w-[40px] min-w-[40px]" />
      </div>
    );
  }
);

export default FooterRow;
