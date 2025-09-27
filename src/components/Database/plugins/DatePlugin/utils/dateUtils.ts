import dayjs from "dayjs";

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
