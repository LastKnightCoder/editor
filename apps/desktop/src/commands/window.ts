import { invoke } from "@/electron";

export const setAlwaysOnTop = async (flag: boolean) => {
  return invoke("set-always-on-top", flag);
};

export const closeWindow = async () => {
  return invoke("close-window");
};

/** 恢复、显示并聚焦主窗口（从最小化恢复、移至最前方） */
export const showAndFocusWindow = async () => {
  return invoke("show-and-focus-window");
};

// 新增窗口控制函数
export const minimizeWindow = async () => {
  return invoke("minimize-window");
};

export const maximizeWindow = async () => {
  return invoke("maximize-window");
};

export const toggleFullScreen = async () => {
  return invoke("toggle-fullscreen");
};

export const getWindowState = async (): Promise<{
  isMaximized: boolean;
  isFullScreen: boolean;
}> => {
  return invoke("get-window-state");
};

export const openPomodoroWindow = async () => {
  return invoke("open-pomodoro-window");
};

export const openPomodoroMiniWindow = async () => {
  return invoke("open-pomodoro-mini-window");
};

export const openPomodoroImmersiveWindow = async () => {
  return invoke("open-pomodoro-immersive-window");
};

export const hidePomodoroImmersiveWindow = async () => {
  return invoke("hide-pomodoro-immersive-window");
};
