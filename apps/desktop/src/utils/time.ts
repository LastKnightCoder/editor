import dayjs from "dayjs";

/** 本地时区自然周的周一（周一起始）0 点；DatePlugin 分组与卡片时间分组共用口径 */
export const startOfWeek = (date: Date): Date => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};

export const formatDate = (timestamp: number, hideCurYear: boolean) => {
  const date = dayjs(timestamp);
  const now = dayjs();
  const diff = dayjs(now.format("YYYY-MM-DD")).diff(dayjs(date.format("YYYY-MM-DD")), "day");

  if (diff < 1) {
    return date.format("HH:mm");
  } else if (diff < 2) {
    return "昨天" + date.format("HH:mm");
  } else if (diff < 3) {
    return "前天" + date.format("HH:mm");
  }

  if (hideCurYear && date.year() === now.year()) {
    return date.format("MM-DD HH:mm");
  } else {
    return date.format("YYYY-MM-DD HH:mm");
  }
};
