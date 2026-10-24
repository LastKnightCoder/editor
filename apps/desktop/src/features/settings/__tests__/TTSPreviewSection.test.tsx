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
