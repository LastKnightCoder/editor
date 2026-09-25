import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { VoiceSection } from "../sections/VoiceSection";

const mocks = vi.hoisted(() => ({ openSettings: vi.fn() }));

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
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ openSettings: mocks.openSettings }) },
}));

let container: HTMLDivElement;
let root: Root;
const render = () => act(async () => root.render(<VoiceSection />));
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;

beforeEach(() => {
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      transcription: { ...s.setting.transcription, currentModel: "large-v3" },
      integration: {
        ...s.setting.integration,
        minimax: { ...s.setting.integration.minimax, enabled: false },
      },
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

it("语音转录：渲染行为 / 程序 / 模型分组，「使用」切换当前模型", async () => {
  await render();
  expect(text()).toContain("转录行为");
  expect(text()).toContain("断句粒度");
  expect(text()).toContain("长视频分段转录");
  expect(text()).toContain("转录程序");
  expect(text()).toContain("faster-whisper GPU");
  expect(text()).toContain("/models/whisper");
  expect(text()).toContain("推荐");
  expect(text()).toContain("当前使用");
  expect(container.querySelector('[aria-label="打开模型目录"]')).not.toBeNull();

  await act(async () => button("使用").click());
  expect(useSettingStore.getState().setting.transcription.currentModel).toBe("medium");
});

it("语音合成：Minimax 未连接时跳转「账号与连接」", async () => {
  await render();
  const tab = container.querySelector('[role="tab"][data-tab="tts"]') as HTMLButtonElement;
  await act(async () => tab.click());
  expect(text()).toContain("Minimax");
  expect(text()).toContain("未连接");
  expect(text()).toContain("语音模型");
  await act(async () => button("账号与连接").click());
  expect(mocks.openSettings).toHaveBeenCalledWith("integration");
});
