import { useState, useEffect } from "react";
import { CellValue, ValidationRule } from "../types";

/**
 * 用于验证单元格值的钩子
 */
export function useValidation(value: CellValue, validation?: ValidationRule) {
  const [error, setError] = useState<string | null>(null);

  // 每当值变化时进行验证
  useEffect(() => {
    if (!validation) {
      setError(null);
      return;
    }

    // 必填检查
    if (
      validation.required &&
      (value === null || value === undefined || value === "")
    ) {
      setError("此字段为必填项");
      return;
    }

    // 数字的最小/最大值检查
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

    // 字符串的模式检查
    if (typeof value === "string" && validation.pattern) {
      if (!validation.pattern.test(value)) {
        setError("格式无效");
        return;
      }
    }

    // 自定义验证
    if (validation.custom) {
      const customError = validation.custom(value);
      if (customError) {
        setError(customError);
        return;
      }
    }

    // 如果到达这里，验证通过
    setError(null);
  }, [value, validation]);

  return { error, isValid: error === null };
}

export default useValidation;
