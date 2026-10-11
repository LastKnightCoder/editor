import { defineFieldModel } from "../../model/field-model";
import type { SelectOption } from "../../types";

export const multiSelectFieldModel = defineFieldModel<{ options: SelectOption[] }>({
  type: "multiSelect",
  valueType: "text",
  toText: (value, column) => {
    if (!Array.isArray(value)) return "";
    return value
      .map(id => {
        if (typeof id !== "string" || !id) return "";
        const option = column.config?.options?.find(opt => opt.id === id);
        return option ? option.name : id;
      })
      .filter(Boolean)
      .join("、");
  },
  toScalar: (value, column) => {
    if (!Array.isArray(value)) return null;
    const names = value
      .map(id => column.config?.options?.find(option => option.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : null;
  },
});
