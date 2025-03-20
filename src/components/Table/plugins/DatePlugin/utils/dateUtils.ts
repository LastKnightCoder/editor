import dayjs from "dayjs";

/**
 * 格式化日期
 *
 * @param date 日期值（Date对象或字符串）
 * @param format 格式化字符串，默认为 YYYY-MM-DD
 * @returns 格式化后的日期字符串
 */
export const formatDate = (
  date: Date | string | null,
  format = "YYYY-MM-DD",
): string => {
  if (!date) return "";

  try {
    return dayjs(date).format(format);
  } catch (e) {
    console.error("日期格式化错误:", e);
    return "";
  }
};

/**
 * 解析日期字符串为Date对象
 *
 * @param dateStr 日期字符串
 * @returns Date对象，如果解析失败则返回null
 */
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
export const formatDateForInput = (date: Date | string | null): string => {
  if (!date) return "";

  try {
    return dayjs(date).format("YYYY-MM-DD");
  } catch (e) {
    console.error("日期格式化错误:", e);
    return "";
  }
};
