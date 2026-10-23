import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "../AudioPlayer";
import VideoPlayer from "../VideoPlayer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const mount = async (node: React.ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
};

const mockPointer = (coarse: boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    query =>
      ({
        matches: coarse && query === "(pointer: coarse)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
  );

const loadMetadata = async (media: HTMLMediaElement, duration: number) => {
  Object.defineProperty(media, "duration", { configurable: true, value: duration });
  Object.defineProperty(media, "readyState", { configurable: true, value: 1 });
  await act(async () => {
    media.dispatchEvent(new Event("loadedmetadata"));
    media.dispatchEvent(new Event("durationchange"));
  });
};

const touchTap = (picture: Element, video: HTMLVideoElement, clientX: number) => {
  const down = new MouseEvent("pointerdown", { bubbles: true, clientX });
  Object.defineProperty(down, "pointerType", { value: "touch" });
  picture.dispatchEvent(down);
  video.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX }));
};

beforeEach(() => {
  window.matchMedia ??= (() => ({}) as MediaQueryList) as typeof window.matchMedia;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("粗指针设备的播放器", () => {
  it("视频不出音量与画中画；鼠标设备照常显示音量", async () => {
    mockPointer(true);
    let el = await mount(<VideoPlayer src="a.mp4" />);
    expect(el.querySelector('[aria-label*="音量"], [aria-label*="静音"]')).toBeNull();
    await act(async () => root?.unmount());
    container?.remove();

    mockPointer(false);
    el = await mount(<VideoPlayer src="a.mp4" />);
    expect(el.querySelector('[aria-label*="音量"], [aria-label*="静音"]')).toBeTruthy();
  });

  it("触屏双击画面右半边快进 10 秒、左半边快退，单击延后切换播放", async () => {
    mockPointer(true);
    vi.useFakeTimers();
    const el = await mount(<VideoPlayer src="a.mp4" />);
    const video = el.querySelector("video")!;
    await loadMetadata(video, 600);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    video.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 200 }) as DOMRect;
    video.currentTime = 100;
    const picture = video.parentElement!;

    await act(async () => {
      touchTap(picture, video, 250);
      touchTap(picture, video, 250);
    });
    expect(video.currentTime).toBe(110);
    await act(async () => {
      touchTap(picture, video, 50);
      touchTap(picture, video, 50);
    });
    expect(video.currentTime).toBe(100);

    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    await act(async () => touchTap(picture, video, 150));
    expect(pause).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(300));
    expect(pause.mock.calls.length + play.mock.calls.length).toBeGreaterThan(0);
  });

  it("音频不出音量，标题行有 ±15 秒", async () => {
    mockPointer(true);
    const el = await mount(<AudioPlayer src="a.mp3" label="周会" />);
    const audio = el.querySelector("audio")!;
    await loadMetadata(audio, 600);
    expect(el.querySelector('[aria-label*="音量"], [aria-label*="静音"]')).toBeNull();
    audio.currentTime = 100;
    const forward = el.querySelector<HTMLButtonElement>('[aria-label="快进 15 秒"]')!;
    await act(async () => forward.click());
    expect(audio.currentTime).toBe(115);
    expect(el.querySelector('[aria-label="快退 15 秒"]')).toBeTruthy();
  });
});
