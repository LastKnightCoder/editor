import { BrowserWindow } from "electron";
import log from "electron-log";

/** 日历直接写入及待办/番茄同步入口；读取命令不触发失效。 */
export function isScheduleWrite(channel: string) {
  return /^(calendar(?:-event|-group)?|todo|todo-calendar|pomodoro):(?:create|update|delete|archive|unarchive|toggle|move|complete|uncomplete|skip|sync|remove|cleanup|merge|transfer)(?:-|$)/.test(
    channel
  );
}

export function broadcastScheduleChange(databaseName: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed()) window.webContents.send("schedule:changed", { databaseName });
    } catch (error) {
      log.warn("[schedule] 日程通知失败：", error);
    }
  }
}
