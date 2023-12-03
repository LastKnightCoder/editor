import dayjs from "dayjs";

export const formatDate = (timestamp: number, hideCurYear: boolean) => {
  const date = dayjs(timestamp);
  const now = dayjs();
  const diff = now.get("date") - date.get("date");
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
}