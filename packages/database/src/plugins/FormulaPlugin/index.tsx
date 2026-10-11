import React, { memo } from "react";
import { Sigma } from "lucide-react";
import type { CellFilterDefinition, CellPlugin, CellValue, ColumnDef } from "../../types";
import type { FormulaColumnConfig } from "@tau/shared/database-types";
import {
  formatScalar,
  formulaConfigOf,
  formulaEnumOfColumn,
  formulaTagColor,
  isFormulaCell,
  type Scalar,
} from "../../core/formula";
import { formulaFieldModel } from "./model";
import TextEditor from "../TextPlugin/components/Editor";
import NumberEditor from "../NumberPlugin/components/Editor";
import DatePlugin from "../DatePlugin";
import SelectList from "../../views/TableView/components/SelectList";

const scalarOf = (value: CellValue): Scalar => (isFormulaCell(value) ? value.value : null);
const outputOf = (column: ColumnDef) => formulaConfigOf(column).output;
const isEmpty = (value: Scalar) => value === null || value === "";

const Renderer: React.FC<{ value: CellValue; column: ColumnDef }> = memo(({ value, column }) => {
  const error = isFormulaCell(value) ? value.error : undefined;
  const output = outputOf(column);
  const text = error ? "—" : formatScalar(scalarOf(value), output);
  const color = error ? null : formulaTagColor(column, scalarOf(value));
  if (color)
    return (
      <div className="flex h-full w-full items-center px-2">
        <SelectList options={[{ id: text, name: text, color }]} />
      </div>
    );
  return (
    <div
      className={`box-border flex h-full w-full items-center overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2 ${error ? "text-ink-3" : ""} ${output === "number" ? "tabular-nums" : ""}`}
      title={error}
    >
      {text}
    </div>
  );
});
Renderer.displayName = "FormulaRenderer";

/** 只在筛选面板里输入比较值；公式单元格本身不可编辑 */
const FilterValueEditor: NonNullable<CellPlugin<FormulaColumnConfig>["Editor"]> = props => {
  const output = outputOf(props.column);
  if (output === "number") return <NumberEditor {...props} />;
  if (output === "date" && DatePlugin.Editor) return <DatePlugin.Editor {...props} />;
  return <TextEditor {...props} />;
};

const rule = (
  operator: string,
  test: (cell: Scalar, filterValue: CellValue) => boolean,
  requiresValue = true
): CellFilterDefinition<FormulaColumnConfig> => ({
  operator,
  label: operator,
  requiresValue,
  filter: (filterValue, row, column) => test(scalarOf(row[column.id]), filterValue),
});

const emptyRules = [rule("为空", isEmpty, false), rule("不为空", cell => !isEmpty(cell), false)];
const numberIs =
  (test: (a: number, b: number) => boolean) => (cell: Scalar, filterValue: CellValue) =>
    typeof cell === "number" && typeof filterValue === "number" && test(cell, filterValue);
const dateIs =
  (test: (a: number, b: number) => boolean) => (cell: Scalar, filterValue: CellValue) => {
    const start = (filterValue as { start?: unknown } | null)?.start;
    return typeof cell === "number" && typeof start === "number" && test(cell, start);
  };
const textOf = (value: CellValue) => (typeof value === "string" ? value.trim() : "");

const FILTERS: Record<FormulaColumnConfig["output"], CellFilterDefinition<FormulaColumnConfig>[]> =
  {
    number: [
      rule(
        "等于",
        numberIs((a, b) => a === b)
      ),
      rule(
        "不等于",
        numberIs((a, b) => a !== b)
      ),
      rule(
        "大于",
        numberIs((a, b) => a > b)
      ),
      rule(
        "小于",
        numberIs((a, b) => a < b)
      ),
      rule(
        "大于等于",
        numberIs((a, b) => a >= b)
      ),
      rule(
        "小于等于",
        numberIs((a, b) => a <= b)
      ),
      ...emptyRules,
    ],
    text: [
      rule("包含", (cell, value) => typeof cell === "string" && cell.includes(textOf(value))),
      rule("不包含", (cell, value) => typeof cell !== "string" || !cell.includes(textOf(value))),
      rule("等于", (cell, value) => cell === textOf(value)),
      ...emptyRules,
    ],
    boolean: [rule("是", cell => cell === true, false), rule("否", cell => cell !== true, false)],
    date: [
      rule(
        "不早于",
        dateIs((a, b) => a >= b)
      ),
      rule(
        "不晚于",
        dateIs((a, b) => a <= b)
      ),
      ...emptyRules,
    ],
  };

/** 空值排在最后，与方向无关 */
function compareScalars(a: Scalar, b: Scalar, direction: "asc" | "desc"): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  const sign = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  if (typeof a === "boolean" && typeof b === "boolean") return (Number(a) - Number(b)) * sign;
  return String(a).localeCompare(String(b), "zh-CN") * sign;
}

/**
 * 公式列：值由其他列派生（见 core/formula/derive），只读、不落库。
 * 筛选 / 排序 / 搜索 / 分组按公式结果类型工作。
 */
const FormulaPlugin: CellPlugin<FormulaColumnConfig> = {
  type: formulaFieldModel.type,
  name: "公式",
  editable: false,
  Renderer,
  Editor: FilterValueEditor,
  Icon: ({ className }) => <Sigma className={className} />,
  valueType: formulaFieldModel.valueType,
  toScalar: formulaFieldModel.toScalar,
  formatScalar: (value, column) => formatScalar(value, outputOf(column)),
  beforeSave: () => undefined,
  filters: column => FILTERS[outputOf(column) ?? "text"] ?? [],
  sort: ({ a, b, direction, column }) => {
    // 枚举按情况顺序排，与单选按选项顺序一致
    const order = formulaEnumOfColumn(column);
    const rank = (value: Scalar) => {
      const index = order && typeof value === "string" ? order.indexOf(value) : -1;
      return index < 0 ? value : index;
    };
    return compareScalars(rank(scalarOf(a)), rank(scalarOf(b)), direction);
  },
  search: (searchValue, cellValue, column) =>
    Boolean(searchValue) &&
    formatScalar(scalarOf(cellValue), outputOf(column)).includes(searchValue),
  getGroupKey: (row, column) => formatScalar(scalarOf(row[column.id]), outputOf(column)),
};

export default FormulaPlugin;
