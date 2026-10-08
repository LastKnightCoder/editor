import React, { memo, useMemo, useState } from "react";
import { Menu } from "@tau/ui";
import type PluginManager from "../../../PluginManager";
import type { AggregateOp, ColumnDef, FooterSpec, RowData } from "../../../types";
import {
  AGGREGATE_LABELS,
  aggregatesFor,
  createFormulaContext,
  evaluateFooter,
  type FormulaContext,
} from "../../../core/formula";

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

function formatResult(
  column: ColumnDef,
  spec: FooterSpec,
  rows: RowData[],
  ctx: FormulaContext,
  pluginManager: PluginManager
): { text: string; title?: string } {
  const result = evaluateFooter(column.id, spec, rows, ctx);
  if (!result.ok) return { text: "—", title: result.error.message };
  const { kind, value } = result.value;
  if (kind === "count" || value === null) return { text: value === null ? "—" : String(value) };
  const format = pluginManager.getPlugin(column.type)?.formatScalar;
  return { text: format ? format(value, column) : String(Math.round(value * 100) / 100) };
}

const FooterCell: React.FC<{
  column: ColumnDef;
  width: number;
  spec: FooterSpec | undefined;
  rows: RowData[];
  ctx: FormulaContext;
  pluginManager: PluginManager;
  readonly: boolean;
  onChange: FooterRowProps["onChange"];
}> = memo(({ column, width, spec, rows, ctx, pluginManager, readonly, onChange }) => {
  const [open, setOpen] = useState(false);
  const display = useMemo(
    () => (spec ? formatResult(column, spec, rows, ctx, pluginManager) : null),
    [column, spec, rows, ctx, pluginManager]
  );
  const ops = aggregatesFor(ctx.resolveColumn(column.id)?.valueType ?? null);

  const content = (
    <span className="flex min-w-0 items-baseline justify-end gap-1.5">
      {spec && display ? (
        <>
          <span className="text-ink-3 text-tau-tiny shrink-0">{AGGREGATE_LABELS[spec.op]}</span>
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

  return (
    <div
      className="border-line-2 box-border flex h-9 items-center border-r px-1"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {readonly || column.readonly ? (
        display && <div className="text-tau-sm w-full px-2">{content}</div>
      ) : (
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
            value={spec?.op ?? "none"}
            onValueChange={value => {
              onChange(
                column.id,
                value === "none" ? null : { kind: "aggregate", op: value as AggregateOp }
              );
              setOpen(false);
            }}
          >
            <Menu.RadioItem value="none">无</Menu.RadioItem>
            <Menu.Separator />
            {ops
              .filter(op => !COUNT_OPS.has(op))
              .map(op => (
                <Menu.RadioItem key={op} value={op}>
                  {AGGREGATE_LABELS[op]}
                </Menu.RadioItem>
              ))}
            {ops.some(op => !COUNT_OPS.has(op)) && <Menu.Separator />}
            {ops
              .filter(op => COUNT_OPS.has(op))
              .map(op => (
                <Menu.RadioItem key={op} value={op}>
                  {AGGREGATE_LABELS[op]}
                </Menu.RadioItem>
              ))}
          </Menu.RadioGroup>
        </Menu>
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
