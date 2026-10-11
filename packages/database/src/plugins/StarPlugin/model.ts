import { defineFieldModel } from "../../model/field-model";

export interface StarConfig {
  max?: number; // 默认 5
  step?: 0.5 | 1; // 默认 0.5
}

export const starFieldModel = defineFieldModel<StarConfig>({
  type: "star",
  valueType: "number",
  // 0 星即未评分，不参与平均，也不产出文本
  toText: value => (typeof value === "number" && value > 0 ? String(value) : ""),
  toScalar: value => (typeof value === "number" && value > 0 ? value : null),
});
