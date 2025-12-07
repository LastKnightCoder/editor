import dayjs from "dayjs";
import { DateValue } from "../index";

export const formatDate = (
  ts: number | null,
  format = "YYYY-MM-DD",
): string => {
  if (ts === null || ts === undefined) return "";
  try {
    return dayjs(new Date(ts)).format(format);
  } catch (e) {
    console.error("日期格式化错误:", e);
    return "";
  }
};

export const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parsed = dayjs(dateStr);
  return parsed.isValid() ? parsed.toDate() : null;
};

/**
 * 格式化日期供输入框使用（YYYY-MM-DD格式）
 *
 * @param date 日期值
 * @returns YYYY-MM-DD格式的日期字符串
 */
export const formatDateForInput = (ts: number | null): string => {
  if (ts === null || ts === undefined) return "";
  try {
    return dayjs(new Date(ts)).format("YYYY-MM-DD");
  } catch (e) {
    console.error("日期格式化错误:", e);
    return "";
  }
};

/**
 * 格式化日期范围
 *
 * @param value 日期值对象 { start, end }
 * @param showTime 是否包含时间
 * @param isRange 是否为范围模式
 * @returns 格式化后的日期字符串
 */
export const formatDateRange = (
  value: DateValue | null,
  showTime = false,
  isRange = false,
): string => {
  if (!value || (value.start === null && value.end === null)) {
    return "";
  }

  const format = showTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD";

  // 单值模式：只显示 start
  if (!isRange) {
    return formatDate(value.start, format);
  }

  // 范围模式
  const startStr = formatDate(value.start, format);
  const endStr = formatDate(value.end, format);

  // 如果开始和结束相同，只显示一个
  if (value.start === value.end) {
    return startStr;
  }

  // 显示范围
  if (startStr && endStr) {
    return `${startStr} ~ ${endStr}`;
  }

  // 只有开始或结束
  if (startStr) return startStr;
  if (endStr) return endStr;

  return "";
};
