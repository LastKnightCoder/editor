import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TranscriptionOptionsDialog } from "../TranscriptionOptionsDialog";
import { defaultTranscriptionSelection } from "@/utils/transcription";
import {
  qwenAlignerId,
  qwenModelId,
  qwenRuntimeId,
  type LocalTranscriptionSelection,
} from "../../../../shared/local-transcription";

vi.mock("@/commands/model-downloader", () => ({
  getQwenHardware: vi.fn(async () => ({
    state: "verified",
    names: ["AMD Radeon RX 6600", "Intel Iris Xe"],
  })),
  getModels: async () => ({
    success: true,
    data: [
      { name: "whisper-cpp-base", label: "Base", downloaded: true },
      { name: qwenModelId("1.7B"), label: "Qwen3-ASR 1.7B", downloaded: true },
      { name: qwenRuntimeId("cpu"), label: "CPU 运行包", downloaded: false },
      { name: qwenRuntimeId("gpu"), label: "GPU 运行包", downloaded: true },
      { name: qwenAlignerId, label: "时间对齐模型", downloaded: false },
    ],
  }),
}));

it("单次改用 Qwen 转纯文字可跳过未下载的对齐模型，下一次仍使用全局默认值", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const initial = defaultTranscriptionSelection();
  let submitted: LocalTranscriptionSelection | undefined;
  function element<T extends HTMLElement>(selector: string, label?: string) {
    const found = Array.from(document.querySelectorAll<T>(selector)).find(
      item => !label || item.textContent?.trim() === label
    );
    if (!found) throw new Error("缺少交互控件 " + (label || selector));
    return found;
  }
  const button = (label: string) => element<HTMLButtonElement>("button", label);
  const choose = async (label: string, option: string) => {
    await act(async () => element('button[aria-label="' + label + '"]').click());
    await act(async () => element('[role="option"]', option).click());
  };
  try {
    await act(async () =>
      root.render(
        <TranscriptionOptionsDialog
          initialSelection={initial}
          language="zh"
          onClose={vi.fn()}
          onStart={(_, value) => {
            submitted = value;
          }}
        />
      )
    );
    await choose("转录引擎", "Qwen3-ASR");
    expect(document.body.textContent).toContain("AMD Radeon RX 6600");
    expect(document.body.textContent).toContain("Intel Iris Xe");
    expect(button("开始转录").disabled).toBe(true);
    await choose("输出内容", "纯文字");
    expect(button("开始转录").disabled).toBe(true);
    await choose("运行设备", "GPU 加速（Vulkan）");
    expect(button("开始转录").disabled).toBe(false);
    await choose("运行设备", "CPU");
    await act(async () => element('button[aria-label="重新检测显卡"]').click());
    expect(button("开始转录").disabled).toBe(true);
    await choose("运行设备", "GPU 加速（Vulkan）");
    await act(async () => button("开始转录").click());
    expect(submitted).toMatchObject({
      engine: "qwen",
      qwenModel: "1.7B",
      qwenDevice: "gpu",
      output: "text",
    });
    expect(defaultTranscriptionSelection()).toEqual(initial);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
