import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PomodoroSession } from "@/types/pomodoro";

const bridge = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    state: {
      isSocketOpen: true,
      isServerReady: true,
      client: {
        registerNotificationHandler: (name: string, handler: (payload: unknown) => void) =>
          handlers.set(name, handler),
        unregisterNotificationHandler: (name: string) => handlers.delete(name),
      },
    },
  };
});

vi.mock("@/stores/useBackendWebsocketStore", () => ({
  useBackendWebsocketStore: Object.assign(() => bridge.state, {
    getState: () => bridge.state,
    subscribe: () => () => undefined,
  }),
}));
vi.mock("@/hooks/useInitDatabase", () => ({ default: () => undefined }));
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));
vi.mock("@/constants/backgroundSounds", () => ({
  BACKGROUND_SOUND_FILES: { brook: "/brook.mp3", rain: "/rain.mp3" },
}));
vi.mock("@/commands/pomodoro", () => ({
  getActivePomodoroSession: async () => null,
  getBackgroundSound: async () => ({ backgroundSound: "brook", backgroundVolume: 25 }),
  pausePomodoroSession: vi.fn(),
  resumePomodoroSession: vi.fn(),
  setBackgroundSound: vi.fn(),
  startPomodoroSession: vi.fn(),
  stopPomodoroSession: vi.fn(),
}));

import BackgroundAudio from "../windows/BackgroundAudio";
import { usePomodoroTimer } from "../timerStore";

describe("隐藏背景音窗口", () => {
  const emit = (name: string, payload: unknown) => {
    const handler = bridge.handlers.get(name);
    if (!handler) throw new Error(`通知未注册：${name}`);
    handler(payload);
  };

  it("与统一会话通知同步播放、暂停、音量及结束，卸载释放音频", async () => {
    const audio = {
      src: "",
      loop: false,
      volume: 0,
      paused: true,
      currentTime: 0,
      load: vi.fn(),
      play: vi.fn(async () => {
        audio.paused = false;
        audio.currentTime = 1;
      }),
      pause: vi.fn(() => {
        audio.paused = true;
      }),
    };
    vi.stubGlobal("Audio", function () {
      return audio;
    });
    usePomodoroTimer.setState({ session: null, sound: null, volume: 50, ready: false });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const session: PomodoroSession = {
      id: 1,
      presetId: 2,
      startTime: 10,
      focusMs: 0,
      pauseTotalMs: 0,
      pauseCount: 0,
      pauses: [],
      status: "running",
      createTime: 10,
      updateTime: 10,
    };
    try {
      await act(async () => root.render(<BackgroundAudio />));
      expect(audio.src).toBe("/brook.mp3");
      expect(audio.volume).toBe(0.25);
      expect(audio.paused).toBe(true);

      await act(async () => emit("pomodoro:active-session-changed", session));
      expect(audio.paused).toBe(false);
      await act(async () =>
        emit("pomodoro:active-session-changed", { ...session, status: "paused" })
      );
      expect(audio.paused).toBe(true);
      await act(async () =>
        emit("pomodoro:background-sound-changed", {
          backgroundSound: "rain",
          backgroundVolume: 80,
        })
      );
      expect(audio.src).toBe("/rain.mp3");
      expect(audio.volume).toBe(0.8);
      expect(audio.paused).toBe(true);
      await act(async () => emit("pomodoro:active-session-changed", session));
      expect(audio.paused).toBe(false);
      await act(async () => emit("pomodoro:active-session-changed", null));
      expect(audio.paused).toBe(true);
      expect(audio.currentTime).toBe(0);
    } finally {
      act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
    expect(audio.src).toBe("");
  });
});
