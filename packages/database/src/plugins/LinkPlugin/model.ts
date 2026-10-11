import { defineFieldModel } from "../../model/field-model";

export const linkFieldModel = defineFieldModel({
  type: "link",
  valueType: "text",
  toText: value => (value === null || value === undefined ? "" : String(value)),
});
