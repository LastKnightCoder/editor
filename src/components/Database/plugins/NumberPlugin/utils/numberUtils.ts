/**
 * 格式化数字值
 *
 * @param value 要格式化的数值
 * @param config 格式化配置
 * @returns 格式化后的字符串
 */
export const formatNumber = (
  value: number | string | null,
  config?: {
    precision?: number;
    thousandSeparator?: boolean;
    prefix?: string;
    suffix?: string;
  },
): string => {
  if (value === null || value === undefined || value === "") return "";

  // 确保值是数字
  let numValue: number;
  try {
    numValue = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(numValue)) return "";
  } catch (e) {
    return "";
  }

  let formatted = numValue.toString();

  if (config?.precision !== undefined) {
    formatted = numValue.toFixed(config.precision);
  }

  // 应用千位分隔符
  if (config?.thousandSeparator) {
    const parts = formatted.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    formatted = parts.join(".");
  }

  // 添加前缀和后缀
  const prefix = config?.prefix || "";
  const suffix = config?.suffix || "";

  return `${prefix}${formatted}${suffix}`;
};

/**
 * 解析字符串为数字
 *
 * @param value 要解析的字符串
 * @returns 解析后的数值，解析失败返回null
 */
export const parseNumber = (value: string | number | null): number | null => {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") return value;

  // 移除非数字字符（保留小数点和负号）
  const cleanValue = String(value)
    .replace(/[^\d.-]/g, "")
    .replace(/^(-)?0+(?=\d)/, "$1"); // 删除前导零，保留负号

  try {
    const num = parseFloat(cleanValue);
    return isNaN(num) ? null : num;
  } catch (e) {
    return null;
  }
};
