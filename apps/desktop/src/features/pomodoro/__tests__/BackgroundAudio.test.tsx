import { expect, it, vi } from "vitest";
import type { PomodoroAudioPlayback } from "@/types/pomodoro";

const bridge = vi.hoisted(() => ({
  receive: undefined as ((event: unknown, state: PomodoroAudioPlayback) => void) | undefined,
}));
vi.mock("@/electron", () => ({
  on: (_name: string, listener: typeof bridge.receive) => {
    bridge.receive = listener;
  },
  off: () => {
    bridge.receive = undefined;
  },
  send: vi.fn(),
}));
vi.mock("@/constants/backgroundSounds", () => ({
  BACKGROUND_SOUND_FILES: { brook: "/brook.mp3", rain: "/rain.mp3" },
}));

import { connectPomodoroAudio } from "../background-audio";

it("有会话且选了声音才播放，暂停后可续播，结束后释放音源", () => {
  const audio = {
    src: "",
    volume: 1,
    paused: true,
    async play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    removeAttribute() {
      this.src = "";
    },
    currentTime: 0,
    duration: 7,
    onloadedmetadata: undefined as (() => void) | undefined,
    load: vi.fn(),
  };
  const AudioConstructor = vi.fn(function () {
    return audio;
  });
  vi.stubGlobal("Audio", AudioConstructor);
  const disconnect = connectPomodoroAudio();
  const update = (
    status: PomodoroAudioPlayback["status"],
    sound: PomodoroAudioPlayback["sound"],
    volume = 25,
    positionMs = 0
  ) => {
    if (!bridge.receive) throw new Error("播放器未注册");
    bridge.receive(null, { status, sound, volume, positionMs });
  };
  try {
    update(null, "brook");
    update("running", null);
    expect(AudioConstructor).not.toHaveBeenCalled();
    update("running", "brook", 25, 9500);
    audio.onloadedmetadata?.();
    expect(audio.currentTime).toBe(2.5);
    expect(audio.paused).toBe(false);
    expect(audio.src).toBe("/brook.mp3");
    expect(audio.volume).toBe(0.25);
    update("paused", "brook");
    expect(audio.paused).toBe(true);
    update("running", "rain", 80);
    expect(audio.src).toBe("/rain.mp3");
    expect(audio.volume).toBe(0.8);
    expect(audio.paused).toBe(false);
    update(null, "rain");
    expect(audio.paused).toBe(true);
    expect(audio.src).toBe("");
  } finally {
    disconnect();
    vi.unstubAllGlobals();
  }
});
