import { defineFieldModel } from "../../model/field-model";
import type { CellValue } from "../../types";
import type { ProgressValue } from "./types";

const ratioOf = (value: CellValue): number | null => {
  const progress = value as ProgressValue | null;
  return progress && progress.target > 0 ? progress.current / progress.target : null;
};

/** 进度比率（0~1）的百分比文本，单元格与汇总共用同一口径 */
export const formatProgressRatio = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export const progressFieldModel = defineFieldModel<null>({
  type: "progress",
  valueType: "number",
  toText: value => {
    const ratio = ratioOf(value);
    return ratio === null ? "" : formatProgressRatio(ratio);
  },
  toScalar: ratioOf,
});
