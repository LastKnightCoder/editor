import { BrowserWindow } from "electron";
import log from "electron-log";

type BroadcastListener = (channel: string, databaseName: string) => void;
const broadcastListeners = new Set<BroadcastListener>();

/** 主进程内订阅已发出的库级变更通知（插件业务事件据此给出待办 / 日程的集合级变化）。 */
export function onDatabaseChangeBroadcast(listener: BroadcastListener): () => void {
  broadcastListeners.add(listener);
  return () => broadcastListeners.delete(listener);
}

/** 通知失败不改变已经提交的写入结果，也不阻断其余窗口。 */
export function broadcastDatabaseChange(
  channel: string,
  databaseName: string,
  extra?: Record<string, unknown>
) {
  for (const listener of broadcastListeners) {
    try {
      listener(channel, databaseName);
    } catch (error) {
      log.warn(`[database] 变更通知监听失败：${channel}`, error);
    }
  }
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed()) window.webContents.send(channel, { ...extra, databaseName });
    } catch (error) {
      log.warn(`[database] 变更通知失败：${channel}`, error);
    }
  }
}
