import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useSettingStore from "@/stores/useSettingStore";
import { VoiceSection } from "../sections/VoiceSection";
import { useSettingsStore } from "@/app/settingsStore";

vi.mock("@/commands", () => ({
  getModels: vi.fn(async () => ({
    success: true,
    data: [
      {
        name: "large-v3",
        label: "Large V3",
        size: "3.1 GB",
        description: "精度最高",
        recommended: true,
        downloaded: true,
      },
      { name: "medium", label: "Medium", size: "1.5 GB", description: "均衡", downloaded: true },
      { name: "small", label: "Small", size: "466 MB", description: "速度快", downloaded: false },
    ],
  })),
  getModelsDir: vi.fn(async () => "/models/whisper"),
  getPrograms: vi.fn(async () => ({
    success: true,
    data: [
      {
        name: "fw-gpu",
        label: "faster-whisper GPU",
        type: "GPU",
        size: "1.2 GB",
        downloaded: false,
      },
    ],
  })),
  downloadModel: vi.fn(),
  deleteModel: vi.fn(),
  downloadProgram: vi.fn(),
  deleteProgram: vi.fn(),
  onDownloadProgress: vi.fn(() => () => {}),
  onProgramDownloadProgress: vi.fn(() => () => {}),
  openTranscriptionModelsDir: vi.fn(),
}));
vi.mock("@/platform", () => ({ isMac: false }));

let container: HTMLDivElement;
let root: Root;
const render = () =>
  act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <VoiceSection />
      </QueryClientProvider>
    )
  );
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;

beforeEach(() => {
  useSettingsStore.getState().setVoiceTab("transcription");
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      transcription: { ...s.setting.transcription, currentModel: "large-v3" },
    },
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("语音转录：「使用」切换当前模型", async () => {
  await render();
  expect(container.querySelector('[aria-label="打开模型目录"]')).not.toBeNull();

  await act(async () => button("使用").click());
  expect(useSettingStore.getState().setting.transcription.currentModel).toBe("medium");
});

it("语音合成：只展示服务选择，凭据与账号管理归插件页", async () => {
  await render();
  const tab = container.querySelector('[role="tab"][data-tab="tts"]') as HTMLButtonElement;
  await act(async () => tab.click());
  expect(text()).toContain("请到插件中心安装并启用语音合成插件");
  expect(container.querySelector('input[type="password"]')).toBeNull();

  await act(async () => {
    useSettingStore.setState(s => ({
      setting: {
        ...s.setting,
        ttsProviders: [
          {
            id: "p1",
            name: "Minimax",
            pluginId: "tau.tts-minimax",
            config: { apiKey: "key" },
            models: [{ id: "speech-2.8-hd" }],
          },
        ],
      },
    }));
  });
  expect(useSettingStore.getState().setting.ttsProviders[0]).toMatchObject({
    name: "Minimax",
    config: { apiKey: "key" },
  });
  expect(text()).not.toContain("删除服务商");
  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect(text()).toContain("当前服务");
});

it("换语保留转录程序下载实例和原始进度，不重新加载列表或修改选择", async () => {
  const { desktopLocaleSource } = await import("@/app/i18n/runtime");
  const { voiceText } = await import("../sections/voice.i18n");
  const commands = await import("@/commands");
  const original = desktopLocaleSource.getSnapshot();
  let finish: ((result: { success: boolean }) => void) | undefined;
  vi.mocked(commands.downloadProgram).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  try {
    await render();
    const before = useSettingStore.getState().setting.transcription;
    const models = vi.mocked(commands.getModels).mock.calls.length;
    const programs = vi.mocked(commands.getPrograms).mock.calls.length;
    const subscriptions = vi.mocked(commands.onProgramDownloadProgress).mock.calls.length;
    await act(async () => button(voiceText("ui.download")).click());
    const report = vi.mocked(commands.onProgramDownloadProgress).mock.calls.at(-1)?.[0];
    if (!report || !finish) throw new Error("下载未进入服务边界");
    const message = "原始程序进度 [asset-17]";
    await act(async () =>
      report({
        programName: "fw-gpu",
        percentage: 25,
        message,
        downloadedBytes: 1024,
        totalBytes: 4096,
      })
    );
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(commands.downloadProgram).toHaveBeenCalledExactlyOnceWith("fw-gpu");
      expect(commands.downloadModel).not.toHaveBeenCalled();
      expect(vi.mocked(commands.getModels).mock.calls.length).toBe(models);
      expect(vi.mocked(commands.getPrograms).mock.calls.length).toBe(programs);
      expect(vi.mocked(commands.onProgramDownloadProgress).mock.calls.length).toBe(subscriptions);
      expect(useSettingStore.getState().setting.transcription).toBe(before);
      expect(text()).toContain(message);
    }
    await act(async () => finish?.({ success: true }));
    expect(commands.downloadProgram).toHaveBeenCalledTimes(1);
    expect(useSettingStore.getState().setting.transcription).toBe(before);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
