import { defineFieldModel } from "../../model/field-model";

export const textFieldModel = defineFieldModel({
  type: "text",
  valueType: "text",
  toText: value => (value === null || value === undefined ? "" : String(value)),
});
