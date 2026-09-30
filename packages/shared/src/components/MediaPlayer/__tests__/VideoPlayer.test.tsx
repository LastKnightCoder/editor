import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import VideoPlayer from "../VideoPlayer";
import { VIDEO_POSITION_PREFIX } from "../usePlaybackResume";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const mount = async (node: React.ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

/** jsdom 的 video 没有真实时长，按需补上元数据并派发 loadedmetadata */
const loadMetadata = async (video: HTMLVideoElement, duration: number) => {
  Object.defineProperty(video, "duration", { configurable: true, value: duration });
  Object.defineProperty(video, "readyState", { configurable: true, value: 1 });
  await act(async () => {
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("durationchange"));
  });
};

const press = async (target: HTMLElement, key: string) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
};

describe("VideoPlayer", () => {
  it("底栏渲染信息位", async () => {
    const el = await mount(<VideoPlayer src="a.mp4" info={<span>Bilibili · 标题</span>} />);
    expect(el.textContent).toContain("Bilibili · 标题");
  });

  it("聚焦后方向键快进 5 秒并弹出 OSD", async () => {
    const el = await mount(<VideoPlayer src="a.mp4" />);
    const video = el.querySelector("video")!;
    await loadMetadata(video, 600);
    video.currentTime = 100;

    const player = el.firstElementChild as HTMLElement;
    const event = await press(player, "ArrowRight");

    expect(event.defaultPrevented).toBe(true);
    expect(video.currentTime).toBe(105);
    expect(el.textContent).toContain("+5 秒");
  });

  it("组合键不拦截，交给应用级快捷键", async () => {
    const el = await mount(<VideoPlayer src="a.mp4" />);
    const player = el.firstElementChild as HTMLElement;
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      player.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("快捷键改倍速时回调宿主", async () => {
    const onPlaybackRateChange = vi.fn();
    const el = await mount(
      <VideoPlayer src="a.mp4" playbackRate={1} onPlaybackRateChange={onPlaybackRateChange} />
    );
    await press(el.firstElementChild as HTMLElement, ">");
    expect(onPlaybackRateChange).toHaveBeenCalledWith(1.25);
    expect(el.textContent).toContain("1.25× 速度");
  });

  it("有保存的播放位置时续播并提示，可从头播放", async () => {
    localStorage.setItem(`${VIDEO_POSITION_PREFIX}note.mp4`, "252");
    const el = await mount(<VideoPlayer src="blob:x" persistKey="note.mp4" />);
    const video = el.querySelector("video")!;
    await loadMetadata(video, 728);

    expect(video.currentTime).toBe(252);
    expect(el.textContent).toContain("已从上次的 4:12 继续");

    const restart = Array.from(el.querySelectorAll("button")).find(
      button => button.textContent === "从头播放"
    )!;
    await act(async () => restart.click());
    expect(video.currentTime).toBe(0);
    expect(el.textContent).not.toContain("已从上次");
  });

  it("调用方的 block 等显示类不破坏内部纵向布局", async () => {
    const el = await mount(<VideoPlayer src="a.mp4" className="block w-full" />);
    const player = el.firstElementChild as HTMLElement;
    expect(player.className).toContain("block");
    expect((player.firstElementChild as HTMLElement).className).toContain("flex-col");
  });
});
