import { invoke } from "@/electron";

export const setAlwaysOnTop = async (flag: boolean) => {
  return invoke("set-always-on-top", flag);
};

export const closeWindow = async () => {
  return invoke("close-window");
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
