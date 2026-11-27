import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

import { exposePluginWindow } from "./plugin-window";

const windowRole = process.argv.find(arg => arg.startsWith("--tau-window-role="))?.split("=")[1];
// 日志来源随载荷上报：主进程按「角色#窗口编号」标注，不读窗口标题（标题是笔记标题）
const sendLog = (level: string, message: string) => {
  ipcRenderer.send("logger:renderer-log", { level, message, role: windowRole });
};

if (process.argv.includes("--tau-window-role=plugin-window")) exposePluginWindow();
else if (process.argv.includes("--tau-window-role=pomodoro-audio")) {
  contextBridge.exposeInMainWorld("tauPomodoroAudio", {
    listen(update: (state: import("@/types/pomodoro").PomodoroAudioPlayback) => void) {
      ipcRenderer.on("pomodoro:audio-state", (_event, state) => update(state));
      ipcRenderer.send("pomodoro:audio-ready");
    },
    // 该隐藏窗口没有业务 bridge，日志走与主窗口相同的通道写入 session 文件
    sendLog,
  });
} else
  contextBridge.exposeInMainWorld("electron", {
    invoke: (channel: string, ...args: unknown[]) => {
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, listener);
    },
    off: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcRenderer.off(channel, listener);
    },
    send: (channel: string, ...args: unknown[]) => {
      return ipcRenderer.send(channel, ...args);
    },
    // 页面缩放系数（Ctrl±/Ctrl+滚轮等 Chromium 缩放路径）：渲染端据此判断 zoom 是否变化
    getZoomFactor: () => webFrame.getZoomFactor(),
    // 渲染进程 console 劫持后的日志上报（fire-and-forget），由主进程写入 session 日志文件
    sendLog,
    // 拖入文件的本机路径（Electron 32 起 File.path 已移除，只能在 preload 经 webUtils 取）
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    platform: process.platform,
    windowRole,
  });
