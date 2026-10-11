import { defineFieldModel } from "../../model/field-model";
import type { CellValue, ColumnDef } from "../../types";
import { describeDate } from "./utils/dateUtils";
import type { DatePluginConfig, DateValue } from "./index";

/** 日期列的纯文本：绝对日期（含年份与星期），与当前时间无关；范围用「 → 」连接，开放范围以「起」结尾 */
export function dateText(value: CellValue, column: ColumnDef): string {
  const config = column.config as DatePluginConfig | undefined;
  return describeDate(value as DateValue | null, config ?? {}, Date.now())?.title ?? "";
}

export const dateFieldModel = defineFieldModel<DatePluginConfig>({
  type: "date",
  valueType: "date",
  toText: dateText,
  toScalar: value => {
    const start = (value as DateValue | null)?.start;
    return typeof start === "number" && Number.isFinite(start) ? start : null;
  },
});
