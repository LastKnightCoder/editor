import type { EditorWindowTarget } from "@tau/platform";
import { platform } from "@/platform";

export const setAlwaysOnTop = async (flag: boolean) => {
  return platform.window.setAlwaysOnTop(flag);
};

export const closeWindow = async () => {
  return platform.window.close();
};

/** 恢复、显示并聚焦主窗口（从最小化恢复、移至最前方） */
export const showAndFocusWindow = async () => {
  return platform.window.showAndFocus();
};

// 新增窗口控制函数
export const minimizeWindow = async () => {
  return platform.window.minimize();
};

export const maximizeWindow = async () => {
  return platform.window.maximize();
};

export const toggleFullScreen = async () => {
  return platform.window.toggleFullScreen();
};

export const getWindowState = async (): Promise<{
  isMaximized: boolean;
  isFullScreen: boolean;
}> => {
  return platform.window.getState();
};

/** 在独立编辑窗口打开卡片 / 文章 / 项目文档；已打开则聚焦 */
export const openEditorWindow = async (target: EditorWindowTarget) => {
  return platform.window.openEditorWindow(target);
};

export const closeEditorWindow = async (target: EditorWindowTarget) => {
  return platform.window.closeEditorWindow(target);
};

export const openPomodoroWindow = async () => {
  return platform.window.openPomodoroWindow();
};

export const openPomodoroMiniWindow = async () => {
  return platform.window.openPomodoroMiniWindow();
};

export const hidePomodoroMiniWindow = async () => {
  return platform.window.hidePomodoroMiniWindow();
};

export const openPomodoroImmersiveWindow = async () => {
  return platform.window.openPomodoroImmersiveWindow();
};

export const hidePomodoroImmersiveWindow = async () => {
  return platform.window.hidePomodoroImmersiveWindow();
};
