import { defineFieldModel } from "../../model/field-model";
import type { CellValue, ColumnDef } from "../../types";
import { formatNumber } from "./utils/numberUtils";

export interface NumberColumnConfig {
  precision?: number;
  thousandSeparator?: boolean;
  prefix?: string;
  suffix?: string;
}

/** 数字列的展示文本：沿用数字插件格式化，未配置小数位时整数不带小数、非整数保留两位 */
export function numberText(value: CellValue, column: ColumnDef): string {
  if (typeof value !== "number") return "";
  const config = (column.config ?? {}) as Partial<NumberColumnConfig>;
  return formatNumber(value, {
    ...config,
    precision: config.precision ?? (Number.isInteger(value) ? undefined : 2),
  });
}

export const numberFieldModel = defineFieldModel<NumberColumnConfig>({
  type: "number",
  valueType: "number",
  toText: numberText,
});
