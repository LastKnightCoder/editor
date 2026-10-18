import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TTSPluginCloneSection } from "../sections/TTSPluginCloneSection";
const mocks = vi.hoisted(() => ({ create: vi.fn(), defaultCloner: vi.fn(), clone: vi.fn() }));
vi.mock("@/utils/tts", () => ({
  TTSProviderFactory: { createFromSetting: mocks.create, getVoiceCloner: mocks.defaultCloner },
}));
it("设置页复刻显式使用正在编辑的账号和模型，不读取默认账号", async () => {
  mocks.clone.mockResolvedValue({ id: "actual", name: "声音", type: "cloned" });
  mocks.create.mockReturnValue({ cloning: { cloneVoice: mocks.clone } });
  const provider = {
    id: "account-a",
    name: "A",
    pluginId: "tau.tts-qwen",
    config: { apiKey: "a" },
    models: [{ id: "model-a" }],
  };
  const onCloned = vi.fn(),
    container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<TTSPluginCloneSection provider={provider} onCloned={onCloned} />)
    );
    const button = (text: string) =>
      [...container.querySelectorAll("button")].find(item => item.textContent?.includes(text))!;
    await act(async () => button("克隆自定义音色").click());
    const file = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(file, "files", {
        configurable: true,
        value: [new File(["voice"], "voice.wav", { type: "audio/wav" })],
      });
      file.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("开始批量克隆").click());
    expect(mocks.create).toHaveBeenCalledWith(provider, "model-a");
    expect(mocks.defaultCloner).not.toHaveBeenCalled();
    expect(onCloned).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
