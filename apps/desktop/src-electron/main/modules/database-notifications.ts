import { BrowserWindow } from "electron";
import log from "electron-log";

/** 通知失败不改变已经提交的写入结果，也不阻断其余窗口。 */
export function broadcastDatabaseChange(
  channel: string,
  databaseName: string,
  extra?: Record<string, unknown>
) {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed()) window.webContents.send(channel, { ...extra, databaseName });
    } catch (error) {
      log.warn(`[database] 变更通知失败：${channel}`, error);
    }
  }
}
