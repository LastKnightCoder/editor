import type { PomodoroAudioPlayback } from "@/types/pomodoro";
import { BACKGROUND_SOUND_FILES } from "@/constants/backgroundSounds";
import { off, on, send } from "@/electron";

export function createPomodoroAudioPlayer() {
  let audio: HTMLAudioElement | undefined;
  let sound: PomodoroAudioPlayback["sound"] = null;
  const release = () => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio = undefined;
    sound = null;
  };
  const apply = (next: PomodoroAudioPlayback) => {
    if (!next.sound || !BACKGROUND_SOUND_FILES[next.sound] || !next.status) return release();
    if (next.status !== "running") {
      audio?.pause();
      return;
    }
    audio ??= new Audio();
    audio.loop = true;
    audio.volume = next.volume / 100;
    if (sound !== next.sound) {
      sound = next.sound;
      const current = audio;
      const source = sound;
      current.onloadedmetadata = () => {
        if (audio === current && sound === source && next.positionMs >= 250 && current.duration > 0)
          current.currentTime = (next.positionMs / 1000) % current.duration;
      };
      current.src = BACKGROUND_SOUND_FILES[source];
    }
    if (audio.paused)
      void audio.play().catch(error => {
        if (error?.name !== "AbortError") console.warn("番茄背景音播放失败", error);
      });
  };
  return { apply, release };
}

export function connectPomodoroAudio() {
  const player = createPomodoroAudioPlayer();
  const update = (_event: unknown, state: PomodoroAudioPlayback) => player.apply(state);
  on("pomodoro:audio-state", update);
  send("pomodoro:audio-ready");
  const disconnect = () => {
    off("pomodoro:audio-state", update);
    window.removeEventListener("pagehide", disconnect);
    player.release();
  };
  window.addEventListener("pagehide", disconnect, { once: true });
  return disconnect;
}
