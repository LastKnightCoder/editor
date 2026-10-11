import { defineFieldModel } from "../../model/field-model";

export const checkboxFieldModel = defineFieldModel({
  type: "checkbox",
  valueType: "boolean",
  toText: value => (value === null || value === undefined ? "" : value ? "是" : "否"),
});
