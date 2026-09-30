import { useMemo } from "react";
import { CellValue, ValidationRule } from "../types";

/** 按列校验规则检查单元格值，返回错误文案；通过返回 null */
export function validateCellValue(value: CellValue, validation?: ValidationRule): string | null {
  if (!validation) return null;

  if (validation.required && (value === null || value === undefined || value === "")) {
    return "此字段为必填项";
  }

  if (typeof value === "number") {
    if (validation.min !== undefined && value < validation.min) {
      return `值必须至少为 ${validation.min}`;
    }
    if (validation.max !== undefined && value > validation.max) {
      return `值最多为 ${validation.max}`;
    }
  }

  if (typeof value === "string" && validation.pattern && !validation.pattern.test(value)) {
    return "格式无效";
  }

  if (validation.custom) {
    const customError = validation.custom(value);
    if (customError) return customError;
  }

  return null;
}

export function useValidation(value: CellValue, validation?: ValidationRule) {
  const error = useMemo(() => validateCellValue(value, validation), [value, validation]);
  return { error, isValid: error === null };
}

export default useValidation;
