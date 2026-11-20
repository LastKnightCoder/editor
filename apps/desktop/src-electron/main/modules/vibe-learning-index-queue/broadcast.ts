import { BrowserWindow } from "electron";
import type { VibeLearningIndexQueue } from "./index";
import type { TaskProgress } from "@/types/vibe-learning";
import type { TaskStatus } from "./types";

/**
 * 向所有窗口发送消息
 */
export function sendToAllWindows(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  });
}

/**
 * 发送带进度数据的状态变更事件
 * taskProgress 是通用进度，status 字段标识当前阶段（转录/拆分/索引等）
 */
export function sendStatusWithProgress(
  manager: VibeLearningIndexQueue,
  resourceId: number,
  status: TaskStatus,
  taskProgress?: TaskProgress
): void {
  if (taskProgress) {
    manager.taskProgressMap.set(resourceId, {
      status,
      taskProgress,
    });
  } else {
    manager.taskProgressMap.delete(resourceId);
  }

  sendToAllWindows("vibe-learning-status-change", {
    resourceId,
    status,
    taskProgress,
  });
}
