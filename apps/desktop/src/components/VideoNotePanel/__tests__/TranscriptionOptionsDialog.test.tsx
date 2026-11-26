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

const downloads = vi.hoisted(() => ({
  download: vi.fn(),
  subscribe: vi.fn(),
  progress: undefined as
    | ((event: import("@/commands/model-downloader").DownloadProgress) => void)
    | undefined,
}));
vi.mock("@/commands/model-downloader", () => ({
  downloadModel: downloads.download,
  onDownloadProgress: (
    listener: (event: import("@/commands/model-downloader").DownloadProgress) => void
  ) => {
    downloads.subscribe();
    downloads.progress = listener;
    return () => {
      if (downloads.progress === listener) downloads.progress = undefined;
    };
  },
  getQwenHardware: vi.fn(async () => ({
    state: "verified",
    names: ["AMD Radeon RX 6600", "Intel Iris Xe"],
  })),
  getModels: vi.fn(async () => ({
    success: true,
    data: [
      { name: "whisper-cpp-base", label: "Base", downloaded: true },
      { name: qwenModelId("1.7B"), label: "Qwen3-ASR 1.7B", downloaded: true },
      { name: qwenRuntimeId("cpu"), label: "CPU 运行包", downloaded: false },
      { name: qwenRuntimeId("gpu"), label: "GPU 运行包", downloaded: true },
      { name: qwenAlignerId, label: "时间对齐模型", downloaded: false },
    ],
  })),
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

it("转录资源下载期间换语保留设备、识别语言与进度，不重启下载或启动请求", async () => {
  const { desktopLocaleSource } = await import("@/app/i18n/runtime");
  const { transcriptionText } = await import("../i18n-transcription");
  const { getModels, getQwenHardware } = await import("@/commands/model-downloader");
  const { default: settings } = await import("@/stores/useSettingStore");
  const original = desktopLocaleSource.getSnapshot();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const selection: LocalTranscriptionSelection = {
    ...defaultTranscriptionSelection(),
    engine: "qwen",
    qwenDevice: "cpu",
    output: "text",
  };
  const expected = structuredClone(selection);
  const source = settings.getState().setting.transcription.downloadSource;
  const close = vi.fn(),
    start = vi.fn();
  let finish: ((result: { success: boolean }) => void) | undefined;
  downloads.download.mockReset().mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  downloads.subscribe.mockClear();
  try {
    await act(async () =>
      root.render(
        <TranscriptionOptionsDialog
          initialSelection={selection}
          language="en"
          onClose={close}
          onStart={start}
        />
      )
    );
    const button = (key: "ui.downloadRequiredResources" | "ui.startTranscription") =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        node => node.textContent?.trim() === transcriptionText(key)
      );
    await act(async () => {
      await vi.waitFor(() => expect(button("ui.downloadRequiredResources")).not.toBeUndefined());
    });
    const loads = vi.mocked(getModels).mock.calls.length;
    const probes = vi.mocked(getQwenHardware).mock.calls.length;
    const download = button("ui.downloadRequiredResources");
    if (!download) throw new Error("资源下载入口未挂载");
    await act(async () => download.click());
    if (!downloads.progress || !finish) throw new Error("资源下载未进入服务边界");
    const message = "原始下载进度 [runtime-cpu]";
    await act(async () =>
      downloads.progress?.({
        type: "progress",
        modelName: qwenRuntimeId("cpu"),
        percentage: 47,
        message,
      })
    );
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(downloads.download).toHaveBeenCalledExactlyOnceWith(qwenRuntimeId("cpu"), source);
      expect(downloads.subscribe).toHaveBeenCalledTimes(1);
      expect(vi.mocked(getModels).mock.calls.length).toBe(loads);
      expect(vi.mocked(getQwenHardware).mock.calls.length).toBe(probes);
      expect(close).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain(message);
    }
    await act(async () => finish?.({ success: true }));
    const run = button("ui.startTranscription");
    if (!run) throw new Error("转录启动入口未挂载");
    expect(run.disabled).toBe(false);
    await act(async () => run.click());
    expect(close).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledExactlyOnceWith("en", expected);
    expect(downloads.download).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    desktopLocaleSource.setLocale(original);
    container.remove();
  }
});
