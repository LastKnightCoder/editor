import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function formatRelativeTime(ts: number | null): string {
  if (!ts) return "";
  return dayjs(ts).fromNow();
}
