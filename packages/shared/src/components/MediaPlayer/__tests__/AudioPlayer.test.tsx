import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { mediaPlayerMessages } from "../i18n";
import { MediaOsd } from "../MediaControls";
import { useOsd } from "../useMediaKeyboard";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "../AudioPlayer";
import { AUDIO_POSITION_PREFIX } from "../usePlaybackResume";

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

const loadMetadata = async (audio: HTMLAudioElement, duration: number) => {
  Object.defineProperty(audio, "duration", { configurable: true, value: duration });
  Object.defineProperty(audio, "readyState", { configurable: true, value: 1 });
  await act(async () => {
    audio.dispatchEvent(new Event("loadedmetadata"));
    audio.dispatchEvent(new Event("durationchange"));
  });
};

const buttonByText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("button")).find(button => button.textContent?.includes(text));

describe("AudioPlayer", () => {
  it("src 为空时保留卡片占位，显示加载态", async () => {
    const el = await mount(<AudioPlayer src="" label="访谈录音" />);
    expect(el.textContent).toContain("访谈录音");
    expect(el.textContent).toContain("--:--");
    expect(el.querySelector("button[aria-label=播放]")).toBeNull();
  });

  it("标题下显示信息位与时长", async () => {
    const el = await mount(<AudioPlayer src="a.m4a" label="访谈录音" info="本地文件" />);
    await loadMetadata(el.querySelector("audio")!, 195);
    expect(el.textContent).toContain("本地文件");
    expect(el.textContent).toContain("3:15");
  });

  it("播放失败时说明原因并可重试", async () => {
    const el = await mount(<AudioPlayer src="missing.m4a" />);
    const audio = el.querySelector("audio")!;
    Object.defineProperty(audio, "error", { configurable: true, value: { code: 4 } });
    const load = vi.spyOn(audio, "load").mockImplementation(() => undefined);
    await act(async () => {
      audio.dispatchEvent(new Event("error"));
    });
    expect(el.textContent).toContain("无法播放：文件不存在或格式不支持");

    await act(async () => buttonByText(el, "重试")!.click());
    expect(load).toHaveBeenCalled();
    expect(el.textContent).not.toContain("无法播放");
  });

  it("文本生成的音频可展开原文", async () => {
    const el = await mount(
      <AudioPlayer src="tts.mp3" label="语音配音" sourceText="以教代学的原文" />
    );
    expect(el.textContent).toContain("文本生成");
    expect(el.textContent).not.toContain("以教代学的原文");
    await act(async () => buttonByText(el, "原文")!.click());
    expect(el.textContent).toContain("以教代学的原文");
  });

  it("聚焦后方向键后退 5 秒并弹出 OSD", async () => {
    const el = await mount(<AudioPlayer src="a.m4a" />);
    const audio = el.querySelector("audio")!;
    await loadMetadata(audio, 195);
    audio.currentTime = 60;
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      (el.firstElementChild as HTMLElement).dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(audio.currentTime).toBe(55);
    expect(el.textContent).toContain("−5 秒");
  });

  it("全屏 / 画中画快捷键对音频放行", async () => {
    const el = await mount(<AudioPlayer src="a.m4a" />);
    const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
    await act(async () => {
      (el.firstElementChild as HTMLElement).dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("1 分钟以上的音频按持久化键续播", async () => {
    localStorage.setItem(`${AUDIO_POSITION_PREFIX}long.m4a`, "1312");
    const el = await mount(<AudioPlayer src="blob:x" persistKey="long.m4a" />);
    const audio = el.querySelector("audio")!;
    await loadMetadata(audio, 3735);
    expect(audio.currentTime).toBe(1312);
    expect(el.textContent).toContain("已从上次的 21:52 继续");
  });

  it("超过 30 分钟不解码波形，直接用进度线", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const el = await mount(<AudioPlayer src="podcast.mp3" />);
    await loadMetadata(el.querySelector("audio")!, 3735);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(el.querySelector("[aria-label=播放进度]")).toBeNull();
    fetchSpy.mockRestore();
  });
  it("元数据就绪前先显示已知时长", async () => {
    const el = await mount(<AudioPlayer src="podcast.mp3" label="播客" durationHint={756} />);
    expect(el.textContent).toContain("12:36");
  });

  it("附加操作与底部内容：底部可从指定位置开始播放", async () => {
    const el = await mount(
      <AudioPlayer
        src="podcast.mp3"
        actions={<button type="button">更多</button>}
        footer={({ currentTime, playFrom }) => (
          <button type="button" onClick={() => playFrom(42)}>
            跳到第二句 {Math.floor(currentTime)}
          </button>
        )}
      />
    );
    const audio = el.querySelector("audio")!;
    await loadMetadata(audio, 120);
    const play = vi.spyOn(audio, "play").mockResolvedValue(undefined);
    expect(buttonByText(el, "更多")).toBeTruthy();

    await act(async () => buttonByText(el, "跳到第二句")!.click());
    expect(audio.currentTime).toBe(42);
    expect(play).toHaveBeenCalled();
  });
});

it("语言切换保留播放器、播放进度与打开的倍速菜单，不重新加载媒体", async () => {
  const locale = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: locale });
  try {
    const el = await mount(
      <I18nRuntimeProvider runtime={runtime}>
        <AudioPlayer src="stable.m4a" playbackRate={1.25} sourceText="用户原文" />
      </I18nRuntimeProvider>
    );
    const audio = el.querySelector("audio");
    if (!audio) throw new Error("播放器未挂载");
    await loadMetadata(audio, 3735);
    await act(async () => {
      audio.currentTime = 42;
      audio.volume = 0.4;
      audio.dispatchEvent(new Event("timeupdate"));
      audio.dispatchEvent(new Event("volumechange"));
      audio.dispatchEvent(new Event("play"));
    });
    const source = buttonByText(el, runtime.get(mediaPlayerMessages).t("audio.source"));
    if (!source) throw new Error("原文入口未挂载");
    await act(async () => source.click());
    const menu = el.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
    if (!menu) throw new Error("倍速入口未挂载");
    await act(async () => menu.click());
    const list = el.querySelector('[role="listbox"]');
    if (!list) throw new Error("倍速菜单未打开");
    const selected = list.querySelector('[aria-selected="true"]');
    const load = vi.spyOn(audio, "load").mockImplementation(() => undefined);
    const play = vi.spyOn(audio, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(audio, "pause").mockImplementation(() => undefined);
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(el.querySelector("audio")).toBe(audio);
      expect(el.querySelector('[role="listbox"]')).toBe(list);
      expect(list.querySelector('[aria-selected="true"]')).toBe(selected);
      expect(el.textContent).toContain("用户原文");
      expect(audio.currentTime).toBe(42);
      expect(audio.volume).toBe(0.4);
      expect(audio.playbackRate).toBe(1.25);
      expect(load).not.toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();
      expect(pause).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root?.unmount());
    root = null;
    runtime.dispose();
    vi.restoreAllMocks();
  }
});

it("正在显示的操作反馈随语言刷新，保留同一反馈身份与原关闭计时", async () => {
  vi.useFakeTimers();
  const locale = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: locale });
  let current = (): ReturnType<typeof useOsd>["osd"] => null;
  const Probe = () => {
    const state = useOsd();
    current = () => state.osd;
    return (
      <>
        <button onClick={() => state.showOsd({ key: "osd.muted" })}>action</button>
        <MediaOsd osd={state.osd} />
      </>
    );
  };
  try {
    const el = await mount(
      <I18nRuntimeProvider runtime={runtime}>
        <Probe />
      </I18nRuntimeProvider>
    );
    await act(async () => el.querySelector("button")?.click());
    const initial = current();
    const timeout = vi.spyOn(window, "setTimeout");
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(current()).toBe(initial);
      expect(el.textContent).toContain(runtime.get(mediaPlayerMessages).t("osd.muted"));
    }
    expect(timeout).not.toHaveBeenCalled();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(current()).toBeNull();
  } finally {
    await act(async () => root?.unmount());
    root = null;
    runtime.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
