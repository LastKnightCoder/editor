import { useState, useEffect } from "react";
import { CellValue, ValidationRule } from "../types";

export function useValidation(value: CellValue, validation?: ValidationRule) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validation) {
      setError(null);
      return;
    }

    if (
      validation.required &&
      (value === null || value === undefined || value === "")
    ) {
      setError("此字段为必填项");
      return;
    }

    if (typeof value === "number") {
      if (validation.min !== undefined && value < validation.min) {
        setError(`值必须至少为 ${validation.min}`);
        return;
      }

      if (validation.max !== undefined && value > validation.max) {
        setError(`值最多为 ${validation.max}`);
        return;
      }
    }

    if (typeof value === "string" && validation.pattern) {
      if (!validation.pattern.test(value)) {
        setError("格式无效");
        return;
      }
    }

    if (validation.custom) {
      const customError = validation.custom(value);
      if (customError) {
        setError(customError);
        return;
      }
    }

    setError(null);
  }, [value, validation]);

  return { error, isValid: error === null };
}

export default useValidation;
