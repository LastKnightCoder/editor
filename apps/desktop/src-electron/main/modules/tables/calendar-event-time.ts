import type { CreateCalendarEvent } from "@/types/calendar";
import type { SqliteRow } from "../../types/table";

export function localEventPoint(instant: number) {
  const date = new Date(instant);
  return {
    day: new Date(instant).setHours(0, 0, 0, 0),
    minute: date.getHours() * 60 + date.getMinutes(),
  };
}

function resolvePoint(day: number, minute: number, previous: unknown) {
  if (typeof previous === "number") {
    const local = localEventPoint(previous);
    if (local.day === day && local.minute === minute) return previous;
  }
  const local = new Date(day);
  local.setHours(0, minute, 0, 0);
  if (local.getHours() * 60 + local.getMinutes() !== minute)
    throw new Error("该时刻在设备时区不存在，请重新选择时间");
  return local.getTime();
}

export interface EventZoneInput {
  startInstant?: number;
  endInstant?: number;
  startTimeZone?: string;
  endTimeZone?: string;
}

function zoneName(value: string) {
  new Intl.DateTimeFormat("en", { timeZone: value });
  if (!value || /^[+-]/.test(value)) throw new Error("日程需要有效的 IANA 时区");
  return value;
}

export function eventTimeStorage(
  data: CreateCalendarEvent,
  source?: EventZoneInput,
  previous?: SqliteRow
) {
  const empty = [null, null, null, null] as const;
  if (data.allDay || data.startTime == null) {
    if (source?.startTimeZone || source?.endTimeZone) throw new Error("只有定时日程可以指定时区");
    return empty;
  }
  if (data.endTime == null && source?.endTimeZone)
    throw new Error("无结束时间的日程不能指定结束时区");
  const start =
    source?.startInstant ?? resolvePoint(data.startDate, data.startTime, previous?.start_utc_ms);
  const end =
    data.endTime == null
      ? null
      : (source?.endInstant ??
        resolvePoint(data.endDate ?? data.startDate, data.endTime, previous?.end_utc_ms));
  if (end != null && end < start) throw new Error("结束时间不能早于开始时间");
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const startZone = source?.startTimeZone ?? (previous?.start_time_zone as string | null) ?? device;
  const endZone = source?.endTimeZone ?? (previous?.end_time_zone as string | null) ?? startZone;
  return [start, end, zoneName(startZone), end == null ? null : zoneName(endZone)] as const;
}
