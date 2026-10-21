import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { UiProvider, toast } from "@tau/ui";
import { VoiceTtsPanel } from "../sections/VoiceTtsPanel";

const mocks = vi.hoisted(() => ({
  active: false,
  synthesize: vi.fn(),
  voices: vi.fn(),
  setting: {
    ttsProviders: [
      {
        id: "minimax-legacy",
        name: "MiniMax",
        pluginId: "tau.tts-minimax",
        config: {},
        models: [{ id: "speech-test" }],
      },
    ],
    ttsUsageSettings: {
      default: { providerId: "minimax-legacy", modelId: "speech-test", voiceId: "voice-test" },
    },
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: Object.assign(
    (selector: (state: { setting: typeof mocks.setting }) => unknown) =>
      selector({ setting: mocks.setting }),
    { getState: () => ({ setting: mocks.setting }) }
  ),
}));
vi.mock("@/app/plugins/context", () => {
  const runtime = {
    listSettings: () =>
      mocks.active
        ? [{ definition: { target: "tts" }, context: { pluginId: "tau.tts-minimax" } }]
        : [],
  };
  return { useDesktopPlugins: () => runtime };
});
vi.mock("@/utils/tts", () => ({
  TTSProviderFactory: { getSpeechSynthesizer: mocks.synthesize },
}));
vi.mock("../sections/TTSPluginSettings", () => ({ TTSPluginSettings: () => null }));
vi.mock("../sections/TTSPluginCloneSection", () => ({ TTSPluginCloneSection: () => null }));
vi.mock("../components/TtsProviderCreateDialog", () => ({ TtsProviderCreateDialog: () => null }));

const container = document.createElement("div");
const root = createRoot(container);
const render = () =>
  act(async () =>
    root.render(
      <UiProvider>
        <VoiceTtsPanel />
      </UiProvider>
    )
  );
afterEach(() => {
  mocks.active = false;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("缺失或停用插件时不创建语音实例、不展示迁移账号，底层配置保持不变", async () => {
  const before = structuredClone(mocks.setting);
  const error = vi.spyOn(toast, "error");
  await render();
  expect(mocks.synthesize).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("minimax-legacy");
  expect(container.textContent).not.toContain("MiniMax");
  expect(container.textContent).toContain("请选择提供商");
  expect(error).not.toHaveBeenCalled();
  expect(mocks.setting).toEqual(before);
  await act(async () => root.render(null));
});

it("插件启用后加载音色，停用后忽略在途失败并隐藏账号", async () => {
  let rejectVoices!: (error: Error) => void;
  mocks.voices.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectVoices = reject;
      })
  );
  mocks.synthesize.mockReturnValue({ getVoiceList: mocks.voices });
  const error = vi.spyOn(toast, "error");
  mocks.active = true;
  await render();
  expect(mocks.voices).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("MiniMax");

  mocks.active = false;
  await render();
  await act(async () => rejectVoices(new Error("语音插件未安装或未启用")));
  expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("minimax-legacy");
  expect(container.textContent).not.toContain("MiniMax");
  await act(async () => root.render(null));
});
