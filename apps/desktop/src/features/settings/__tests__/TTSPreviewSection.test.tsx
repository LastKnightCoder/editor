import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { TTSPreviewSection } from "../sections/TTSPreviewSection";
import type { TTSProviderSetting } from "@/types/tts";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  voices: vi.fn(),
  synthesize: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("@/utils/tts", () => ({ TTSProviderFactory: { createFromSetting: mocks.create } }));
vi.mock("@tau/shared", () => ({
  AudioPlayer: ({ src, sourceText }: { src: string; sourceText?: string }) => (
    <div data-testid="player" data-src={src} data-text={sourceText} />
  ),
}));

const account = (id: string, pluginId: string): TTSProviderSetting => ({
  id,
  name: `账号 ${id}`,
  pluginId,
  config: { apiKey: id },
  models: [{ id: `${id}-model-1` }, { id: `${id}-model-2` }],
});
const providers = [account("a", "tau.tts-a"), account("b", "tau.tts-b")];
const usage = { providerId: "b", modelId: "b-model-2", voiceId: "voice-b" };

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.voices.mockResolvedValue([{ id: "voice-b", name: "音色 B", type: "system" }]);
  mocks.dispose.mockResolvedValue(undefined);
  mocks.create.mockImplementation(() => ({
    synthesis: {
      getVoiceList: mocks.voices,
      synthesizeSpeech: mocks.synthesize,
      dispose: mocks.dispose,
    },
  }));
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const render = (available: (pluginId: string) => boolean = () => true) =>
  act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <UiProvider>
          <TTSPreviewSection providers={providers} usage={usage} isAvailable={available} />
        </UiProvider>
      </QueryClientProvider>
    )
  );
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === text);

it("默认跟随当前服务合成，并在页内给出可播放的音频", async () => {
  mocks.synthesize.mockResolvedValue({ audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" });
  await render();
  expect(mocks.create).toHaveBeenCalledWith(providers[1], "b-model-2");
  await act(async () => button("合成并试听")?.click());
  expect(mocks.synthesize).toHaveBeenCalledWith(
    expect.stringContaining("语音合成试听"),
    "voice-b",
    undefined,
    expect.any(AbortSignal)
  );
  const player = container.querySelector("[data-testid=player]");
  expect(player?.getAttribute("data-src")).toBe("blob:preview");
  expect(player?.getAttribute("data-text")).toContain("语音合成试听");
  expect(button("重新生成")).toBeTruthy();
  expect(mocks.dispose).toHaveBeenCalled();
});

it("插件未启用的账号不参与试听，全部不可用时给出空态", async () => {
  await render(pluginId => pluginId === "tau.tts-a");
  expect(mocks.create).toHaveBeenCalledWith(providers[0], "a-model-1");
  expect(mocks.create).not.toHaveBeenCalledWith(providers[1], expect.anything());
  // 回落到其他账号时不沿用当前服务的音色，需要用户重新选择
  expect(button("合成并试听")?.disabled).toBe(true);

  await render(() => false);
  expect(container.textContent).toContain("暂无可试听的账号");
});

it("取消后不交付迟到的音频，失败时页内显示原因", async () => {
  let resolve!: (value: { audio: Uint8Array; mime: string }) => void;
  let signal: AbortSignal | undefined;
  mocks.synthesize.mockImplementation((_text, _voice, _options, taskSignal: AbortSignal) => {
    signal = taskSignal;
    return new Promise(done => (resolve = done));
  });
  await render();
  await act(async () => button("合成并试听")?.click());
  await act(async () => button("取消")?.click());
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve({ audio: new Uint8Array([1]), mime: "audio/mpeg" }));
  expect(container.querySelector("[data-testid=player]")).toBeNull();

  mocks.synthesize.mockRejectedValue(new Error("账号余额不足"));
  await act(async () => button("合成并试听")?.click());
  expect(container.querySelector("[role=alert]")?.textContent).toBe("账号余额不足");
});

it("换语保留试听草稿、在途合成和已生成音频实例，不重取音色或重放", async () => {
  const { desktopLocaleSource } = await import("@/app/i18n/runtime");
  const { ttsText } = await import("../sections/tts.i18n");
  const original = desktopLocaleSource.getSnapshot();
  let complete: ((result: { audio: Uint8Array; mime: string }) => void) | undefined;
  let signal: AbortSignal | undefined;
  mocks.synthesize.mockImplementation((_text, _voice, _options, taskSignal) => {
    signal = taskSignal;
    return new Promise(resolve => {
      complete = resolve;
    });
  });
  try {
    await render();
    const field = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!field) throw new Error("试听文本未挂载");
    const text = "Original input 保留 model_id";
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        field,
        text
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 4);
    const fetches = mocks.voices.mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(container.querySelector("textarea")).toBe(field);
      expect(field.value).toBe(text);
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 4]);
      expect(mocks.voices.mock.calls.length).toBe(fetches);
      expect(mocks.synthesize).not.toHaveBeenCalled();
    }
    await act(async () => button(ttsText("ui.synthesizeAndPreview"))?.click());
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    expect(mocks.synthesize).toHaveBeenCalledExactlyOnceWith(
      text,
      "voice-b",
      undefined,
      expect.any(AbortSignal)
    );
    expect(signal?.aborted).toBe(false);
    if (!complete) throw new Error("合成未进入服务边界");
    await act(async () => complete?.({ audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" }));
    const player = container.querySelector("[data-testid=player]");
    if (!player) throw new Error("试听音频未交付");
    const clients = mocks.create.mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(container.querySelector("[data-testid=player]")).toBe(player);
      expect(player.getAttribute("data-text")).toBe(text);
      expect(mocks.create.mock.calls.length).toBe(clients);
      expect(mocks.voices.mock.calls.length).toBe(fetches);
      expect(mocks.synthesize).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
