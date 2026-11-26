import dayjs from "dayjs";

export { startOfWeek } from "@tau/shared/calendar-utils";

export const formatDate = (timestamp: number, hideCurYear: boolean, locale = "zh-CN") => {
  const date = dayjs(timestamp);
  const now = dayjs();
  const diff = dayjs(now.format("YYYY-MM-DD")).diff(dayjs(date.format("YYYY-MM-DD")), "day");

  const relative = (days: number) =>
    new Intl.ListFormat(locale, { type: "unit", style: "narrow" }).format([
      new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day"),
      date.format("HH:mm"),
    ]);

  if (diff < 1) {
    return date.format("HH:mm");
  } else if (diff < 2) {
    return relative(-1);
  } else if (diff < 3) {
    return relative(-2);
  }

  if (hideCurYear && date.year() === now.year()) {
    return date.format("MM-DD HH:mm");
  } else {
    return date.format("YYYY-MM-DD HH:mm");
  }
};
