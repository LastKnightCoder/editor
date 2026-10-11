import { defineFieldModel } from "../../model/field-model";
import type { SelectOption } from "../../types";

export const selectFieldModel = defineFieldModel<{ options: SelectOption[] }>({
  type: "select",
  valueType: "text",
  toText: (value, column) => {
    if (typeof value !== "string" || !value) return "";
    const option = column.config?.options?.find(opt => opt.id === value);
    return option ? option.name : value;
  },
  toScalar: (value, column) =>
    column.config?.options?.find(option => option.id === value)?.name ?? null,
});
