import { WebContentsView, type WebContents } from "electron";
import path from "node:path";
import log from "electron-log";
import type { PomodoroAudioPlayback, PomodoroAudioState } from "@/types/pomodoro";
import { isAppQuitting } from "../app-quit-state";
import { windowContext } from "./context";

const hosts = new Set<WebContents>();
let background: WebContentsView | undefined;
let backgroundReady = false;
let state: PomodoroAudioState = { status: null, sound: null, volume: 50 };

let elapsedMs = 0;
let playingSince = 0;

function playbackPosition(now: number) {
  return elapsedMs + (state.status === "running" && state.sound ? now - playingSince : 0);
}

function sendPlayback(contents: WebContents) {
  const playback: PomodoroAudioPlayback = {
    ...state,
    positionMs: playbackPosition(performance.now()),
  };
  contents.send("pomodoro:audio-state", playback);
}

function releaseBackground() {
  const contents = background?.webContents;
  background = undefined;
  backgroundReady = false;
  if (contents && !contents.isDestroyed()) {
    contents.setAudioMuted(true);
    contents.close();
  }
}

function syncPlayer() {
  if (isAppQuitting()) return;
  const host = hosts.values().next().value;
  if (host) {
    releaseBackground();
    sendPlayback(host);
    return;
  }
  if (state.status !== "running" || !state.sound) {
    releaseBackground();
    return;
  }
  if (background) {
    if (backgroundReady) sendPlayback(background.webContents);
    return;
  }

  // 最后一个窗口关闭后，仍在运行的番茄钟可以在托盘里继续播放。
  const { devServerUrl, indexHtml, preload } = windowContext();
  const view = new WebContentsView({
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      autoplayPolicy: "no-user-gesture-required",
      additionalArguments: ["--tau-window-role=pomodoro-audio"],
    },
  });
  background = view;
  const contents = view.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", event => event.preventDefault());
  contents.ipc.once("pomodoro:audio-ready", () => {
    if (view !== background) return;
    backgroundReady = true;
    sendPlayback(contents);
  });
  contents.once("render-process-gone", () => {
    if (background === view) releaseBackground();
  });
  const load = devServerUrl
    ? contents.loadURL(new URL("pomodoro-audio.html", devServerUrl).href)
    : contents.loadFile(path.join(path.dirname(indexHtml), "pomodoro-audio.html"));
  void load.catch(error => {
    if (background !== view) return;
    log.error("背景音播放页加载失败", error);
    releaseBackground();
  });
}

export function setPomodoroAudioState(next: PomodoroAudioState) {
  const now = performance.now();
  elapsedMs = state.sound === next.sound && next.status && state.status ? playbackPosition(now) : 0;
  playingSince = now;
  state = next;
  syncPlayer();
}

/** 只给第一个就绪窗口发送播放状态，切换焦点不会打断声音。 */
export function registerPomodoroAudioHost(contents: WebContents) {
  contents.ipc.on("pomodoro:audio-ready", event => {
    if (event.senderFrame !== contents.mainFrame || hosts.has(contents)) return;
    hosts.add(contents);
    if (hosts.size === 1) syncPlayer();
  });
  const remove = () => {
    const owner = hosts.values().next().value === contents;
    hosts.delete(contents);
    if (owner) syncPlayer();
  };
  contents.on("did-navigate", remove);
  contents.on("render-process-gone", remove);
  contents.once("destroyed", remove);
}
