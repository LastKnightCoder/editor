/**
 * 提醒偏好（setting.json 的 reminders 节，本机设置）：新建事项的默认提醒、稍后提醒间隔、
 * 前台横幅开关。只影响新建项，不改已有事项的提醒。
 */
import { normalizeReminders } from "@tau/shared/reminders";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../types";

export const SNOOZE_CHOICES = [5, 10, 15, 30, 60] as const;

export interface ReminderSettings {
  /** 新建截止任务（截止前毫秒数） */
  todo: number[];
  /** 新建定时日程（开始前毫秒数） */
  event: number[];
  /** 新建全天日程（当天零点为基准） */
  allDay: number[];
  snoozeMinutes: number;
  /** 应用在前台时用顶部横幅代替系统通知 */
  foregroundBanner: boolean;
}

const list = (value: unknown) =>
  Array.isArray(value) ? normalizeReminders(value.filter(Number.isFinite)) : [];

export function readReminderSettings(setting: SettingCompat | null = getMobileSettingSnapshot()) {
  const raw = (setting?.reminders ?? {}) as Partial<Record<keyof ReminderSettings, unknown>>;
  const snooze = Number(raw.snoozeMinutes);
  return {
    todo: list(raw.todo),
    event: list(raw.event),
    allDay: list(raw.allDay),
    snoozeMinutes: (SNOOZE_CHOICES as readonly number[]).includes(snooze) ? snooze : 10,
    foregroundBanner: raw.foregroundBanner !== false,
  } satisfies ReminderSettings;
}

export function withReminderSettings(
  prev: SettingCompat,
  patch: Partial<ReminderSettings>
): SettingCompat {
  return { ...prev, reminders: { ...readReminderSettings(prev), ...patch } };
}
