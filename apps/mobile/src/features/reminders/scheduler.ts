/**
 * 提醒排期：从库里取即将到来的提醒，连同进行中的倒计时番茄，整体替换系统里的排期。
 * 触发：启动、回到前台、影响提醒的写命令之后（合并抖动）。iOS 最多保留 64 条待送达通知，
 * 只排最近的 50 条；Android 不设系统上限，排 14 天内最多 200 条。
 */
import { reminderBody, reminderDetail } from "@tau/shared/reminders";
import * as tauri from "../../services/tauri";
import { computeElapsedMs } from "../pomodoro/timer";
import {
  isNativeNotifyAvailable,
  notifySchedule,
  type NotifyEntry,
  type NotifyState,
} from "./native";
import { readReminderSettings } from "./settings";

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

export function toNotifyEntry(item: tauri.UpcomingReminder, now = Date.now()): NotifyEntry {
  // 文档待办与日程在文案上同属「到点提醒」，日程以外都按待办口径书写
  const shape = {
    kind: item.kind === "event" ? ("event" as const) : ("todo" as const),
    anchor: item.anchor,
    allDay: item.allDay,
    end: item.endAt,
  };
  return {
    key: item.key,
    owner: item.owner,
    kind: item.kind,
    ownerId: item.ownerId,
    title: item.title,
    body: reminderBody({ ...shape, remindAt: item.remindAt }),
    detail: reminderDetail({ ...shape, now }),
    // 周期实例要按当次打卡，文档待办要改正文：通知上都不直接「完成」
    actions: item.kind === "todo" && !item.recurring ? "complete" : "ack",
    at: item.remindAt,
  };
}

/** 进行中的倒计时番茄：到点时提醒（应用在后台时页面计时器不会走，靠系统通知） */
async function pomodoroEntry(now: number): Promise<NotifyEntry | null> {
  const session = await tauri.pomodoroGetActiveSession();
  if (!session || session.status !== "running" || !session.expectedMs) return null;
  const at = now + session.expectedMs - computeElapsedMs(session, now);
  if (at <= now) return null;
  const minutes = Math.round(session.expectedMs / 60_000);
  return {
    key: `pomodoro:${session.id}`,
    owner: `pomodoro:${session.id}`,
    kind: "pomodoro",
    ownerId: session.id,
    title: "番茄完成",
    body: `专注 ${minutes} 分钟，休息一下`,
    detail: "",
    actions: "none",
    at,
  };
}

let running: Promise<NotifyState | null> | null = null;
let again = false;

async function run(): Promise<NotifyState | null> {
  const now = Date.now();
  const [upcoming, pomodoro] = await Promise.all([
    tauri.reminderUpcoming(now, now + WINDOW_MS, isIOS() ? 50 : 200),
    pomodoroEntry(now).catch(() => null),
  ]);
  const items = upcoming.items.map(item => toNotifyEntry(item, now));
  if (pomodoro) items.unshift(pomodoro);
  return notifySchedule(items, upcoming.owners, readReminderSettings().snoozeMinutes);
}

/** 重排一次；进行中再次请求时排在其后合并为一次 */
export function resyncReminders(): Promise<NotifyState | null> {
  if (!isNativeNotifyAvailable()) return Promise.resolve(null);
  if (running) {
    again = true;
    return running;
  }
  running = run()
    .catch(error => {
      console.warn("提醒排期失败:", error);
      return null;
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void resyncReminders();
      }
    });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** 写命令后调用：连续写入（含正文自动保存）合并为一次重排 */
export function scheduleResync() {
  clearTimeout(timer);
  timer = setTimeout(() => void resyncReminders(), 1500);
}
