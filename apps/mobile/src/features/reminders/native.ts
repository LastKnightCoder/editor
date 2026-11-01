/**
 * 本地提醒原生插件（`plugin:local-notify`）的前端封装：iOS 走 UNUserNotificationCenter，
 * Android 走 AlarmManager + 系统通知（状态栏图标为 Tau 标志剪影）。
 * 种类：todo / event / doc（正文待办）/ pomodoro（倒计时结束）。
 */
import { addPluginListener, invoke } from "@tauri-apps/api/core";

export type PermissionValue = "granted" | "denied" | "prompt";

export interface NotifyState {
  notifications: PermissionValue;
  /** Android「闹钟和提醒」授权；未授权时提醒可能延后几分钟。iOS 恒为 granted */
  exactAlarm: PermissionValue;
  /** 已排进系统的提醒数 */
  pending: number;
}

/** 交给系统排期的一条提醒：body 带倒计时，detail 是稍后提醒时复用的时间描述 */
export interface NotifyEntry {
  key: string;
  owner: string;
  kind: "todo" | "event" | "doc" | "pomodoro";
  ownerId: number;
  title: string;
  body: string;
  detail: string;
  /** 通知按钮：complete =「完成 / 稍后」，ack =「知道了 / 稍后」，none = 无按钮 */
  actions: "complete" | "ack" | "none";
  at: number;
}

export interface NotifyAction {
  /** tap = 点通知本体；done = 待办「完成」 */
  action: "tap" | "done";
  key: string;
  owner: string;
}

const command = (name: string) => `plugin:local-notify|${name}`;

export const isNativeNotifyAvailable = () =>
  Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export const notifyPermissionState = () => invoke<NotifyState>(command("permission_state"));
export const notifyRequestPermission = () => invoke<NotifyState>(command("request_permission"));
export const notifyOpenSettings = (target: "notifications" | "exactAlarm" = "notifications") =>
  invoke<void>(command("open_settings"), { target });
export const notifySchedule = (items: NotifyEntry[], owners: string[], snoozeMinutes: number) =>
  invoke<NotifyState>(command("schedule"), { items, owners, snoozeMinutes });
export const notifySnooze = (item: NotifyEntry) => invoke<void>(command("snooze"), { item });
export const notifyCancelOwner = (owner: string) =>
  invoke<void>(command("cancel_owner"), { owner });
export const notifySetForegroundBanner = (enabled: boolean) =>
  invoke<void>(command("set_foreground_banner"), { enabled });

export async function notifyTakeActions(): Promise<NotifyAction[]> {
  const result = await invoke<{ actions: NotifyAction[] }>(command("take_actions"));
  return result.actions ?? [];
}

/** 原生有新动作入队时提醒前端来取（负载为空，以 notifyTakeActions 为准） */
export const onNotifyAction = (handler: () => void) =>
  addPluginListener("local-notify", "action", handler);

/** 应用在前台时到点的提醒（原生不发系统横幅，由前端展示） */
export const onNotifyDelivered = (handler: (entry: NotifyEntry) => void) =>
  addPluginListener<NotifyEntry>("local-notify", "delivered", handler);
