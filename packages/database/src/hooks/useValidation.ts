import { useMemo } from "react";
import { CellValue, ValidationRule } from "../types";
import { databaseFallbackT, useDatabaseI18n, type DatabaseT } from "../i18n";

/** 按列校验规则检查单元格值，返回错误文案；通过返回 null。文案经词典翻译，缺省中文兜底 */
export function validateCellValue(
  value: CellValue,
  validation?: ValidationRule,
  t: DatabaseT = databaseFallbackT
): string | null {
  if (!validation) return null;

  if (validation.required && (value === null || value === undefined || value === "")) {
    return t("validation.required");
  }

  if (typeof value === "number") {
    if (validation.min !== undefined && value < validation.min) {
      return t("validation.min", { min: validation.min });
    }
    if (validation.max !== undefined && value > validation.max) {
      return t("validation.max", { max: validation.max });
    }
  }

  if (typeof value === "string" && validation.pattern && !validation.pattern.test(value)) {
    return t("validation.pattern");
  }

  if (validation.custom) {
    const customError = validation.custom(value);
    if (customError) return customError;
  }

  return null;
}

export function useValidation(value: CellValue, validation?: ValidationRule) {
  const { t } = useDatabaseI18n();
  const error = useMemo(() => validateCellValue(value, validation, t), [value, validation, t]);
  return { error, isValid: error === null };
}

export default useValidation;
