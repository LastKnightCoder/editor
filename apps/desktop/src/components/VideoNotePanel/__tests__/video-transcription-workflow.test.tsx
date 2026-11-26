import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialog } from "@tau/ui";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import useSettingStore from "@/stores/useSettingStore";
import type { VideoNote } from "@/types";
import type { LocalTranscriptionSelection } from "../../../../shared/local-transcription";
import type { TranscriptionResponse } from "@/commands/transcription";
import type { PiChatResult } from "@/services/piLLM";
import { useVideoNoteTranscription } from "../useVideoNoteTranscription";

const wire = vi.hoisted(() => ({
  models: vi.fn(),
  extract: vi.fn(),
  segment: vi.fn(),
  transcribe: vi.fn(),
  segmented: vi.fn(),
  cacheStatus: vi.fn(),
  download: vi.fn(),
  ensureOnline: vi.fn(),
  save: vi.fn(),
  stream: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/commands/model-downloader", () => ({ getModels: wire.models }));
vi.mock("@/commands/transcription", () => ({
  transcribeAudio: wire.transcribe,
  extractAudioFromVideo: wire.extract,
  shouldSegmentAudio: wire.segment,
  transcribeAudioSegmented: wire.segmented,
}));
vi.mock("@/commands", () => ({ updateVideoNoteTranscript: wire.save }));
vi.mock("@/commands/remote-video-cache", () => ({
  getRemoteVideoCacheStatus: wire.cacheStatus,
  downloadRemoteVideoWithProgress: wire.download,
}));
vi.mock("@/commands/online-video-cache", () => ({ ensureOnlineVideo: wire.ensureOnline }));
vi.mock("@/hooks/useVideoProviders", () => ({ useVideoProviders: () => ({ providers: [] }) }));
vi.mock("@/services/piLLM", () => ({ piStreamText: wire.stream }));

const selection: LocalTranscriptionSelection = {
  engine: "whisper",
  currentModel: "faster-whisper-base",
  qwenModel: "1.7B",
  qwenDevice: "cpu",
  output: "subtitles",
  optimize: false,
  keepWords: true,
};
const result: TranscriptionResponse = {
  success: true,
  errorCode: "internal",
  data: {
    text: "字幕原文",
    language: "ja",
    duration: 2,
    processingTime: 1,
    segments: [{ text: "字幕原文", start: 0, end: 2000 }],
    wordSegments: [{ text: "原始词", start: 0, end: 2000 }],
  },
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let workflow: ReturnType<typeof useVideoNoteTranscription>;
const saved = vi.fn();
const confirmed = vi.fn();
const note: VideoNote = {
  id: 7,
  createTime: 1,
  updateTime: 1,
  metaInfo: { type: "remote", url: "https://raw.example/video.mp4", title: "来源原名" },
};

function View({ current = note, language = "ja" }: { current?: VideoNote; language?: string }) {
  workflow = useVideoNoteTranscription({ videoNote: current, language, onTranscriptSaved: saved });
  const request = workflow.llmConfirm;
  return (
    <>
      <span>{workflow.progress}</span>
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ""}
        description={request?.description ?? ""}
        confirmText="go-config"
        onConfirm={() => {
          confirmed(request);
          workflow.dismissLlmConfirm();
        }}
        onOpenChange={open => !open && workflow.dismissLlmConfirm()}
      />
    </>
  );
}
const render = async (props: { current?: VideoNote; language?: string } = {}) => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <View {...props} />
      </QueryClientProvider>
    )
  );
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  wire.models.mockResolvedValue({
    success: true,
    data: [{ name: "faster-whisper-base", downloaded: true }],
  });
  wire.cacheStatus.mockResolvedValue({ cached: false });
  wire.download.mockResolvedValue({
    localPath: "/raw/video.mp4",
    fileSize: 12,
    cached: false,
    requestId: 11,
  });
  wire.extract.mockResolvedValue({ success: true, audioPath: "/raw/audio.wav" });
  wire.segment.mockResolvedValue({ success: true, shouldSegment: false });
  wire.transcribe.mockResolvedValue(result);
  wire.segmented.mockResolvedValue(result);
  wire.save.mockResolvedValue(undefined);
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      llmProviders: [],
      llmUsageSettings: { ...state.setting.llmUsageSettings, transcriptionOptimization: null },
      misc: {
        ...state.setting.misc,
        transcription: { ...state.setting.misc.transcription, enableLongVideoSegmentation: true },
      },
    },
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});

it("下载与分段识别中换语保持同一任务和原语言参数，原服务进度不被猜译", async () => {
  let finishDownload!: (value: object) => void;
  let progress!: (value: { progress: number; message: string }) => void;
  wire.download.mockImplementation((_payload, report) => {
    progress = report;
    return new Promise(resolve => {
      finishDownload = resolve;
    });
  });
  let finishTranscription!: (value: TranscriptionResponse) => void;
  let reportTranscription!: (value: { message: string }) => void;
  wire.segment.mockResolvedValue({ success: true, shouldSegment: true, duration: 1200 });
  wire.segmented.mockImplementation((_audio, _options, run) => {
    reportTranscription = run.onProgress;
    return new Promise(resolve => {
      finishTranscription = resolve;
    });
  });
  await render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = workflow.transcribe(undefined, selection);
  });
  const initial = workflow.progress;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(workflow.progress).not.toBe(initial);
    expect(workflow.isTranscribing).toBe(true);
    expect(wire.models).toHaveBeenCalledTimes(1);
    expect(wire.download).toHaveBeenCalledTimes(1);
    expect(wire.extract).not.toHaveBeenCalled();
    expect(wire.save).not.toHaveBeenCalled();
  }
  const known = {
    progress: 31,
    message: "服务原进度：31%",
    code: "video.remote.downloading",
    params: { percent: 31 },
  };
  await act(async () => progress(known));
  expect(workflow.progress).not.toBe(known.message);
  const translated = workflow.progress;
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(workflow.progress).not.toBe(translated);
  expect(wire.download).toHaveBeenCalledTimes(1);
  await act(async () => progress({ progress: 31, message: "服务原进度：31%" }));
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(workflow.progress).toBe("服务原进度：31%");
  await act(async () => finishDownload({ localPath: "/raw/video.mp4" }));
  expect(wire.extract).toHaveBeenCalledWith("/raw/video.mp4");
  const options = wire.segmented.mock.calls[0][1];
  expect(options).toMatchObject({ language: "ja", engine: "whisper", wordTimestamps: true });
  await act(async () => reportTranscription({ message: "识别提供方原进度" }));
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(workflow.progress).toBe("识别提供方原进度");
  expect(wire.segmented).toHaveBeenCalledTimes(1);
  expect(wire.segmented.mock.calls[0][1]).toBe(options);
  await act(async () => {
    finishTranscription(result);
    await pending;
  });
  expect(wire.download).toHaveBeenCalledWith(
    { url: note.metaInfo.type === "remote" ? note.metaInfo.url : "" },
    expect.any(Function)
  );
  expect(wire.save).toHaveBeenCalledWith(
    note.id,
    result.data?.text,
    result.data?.segments,
    result.data?.wordSegments
  );
  expect(saved).toHaveBeenCalledTimes(1);
});

it("配置确认跨语言保持同一对象与确认目标，不重新校验或启动任务", async () => {
  await render();
  await act(async () => workflow.transcribe(undefined, { ...selection, optimize: true }));
  const request = workflow.llmConfirm;
  if (!request) throw new Error("missing config confirmation");
  const title = request.title;
  const button = [...document.querySelectorAll("button")].find(
    item => item.textContent === "go-config"
  );
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(workflow.llmConfirm).toBe(request);
    expect(request.title).not.toBe(title);
    expect(
      [...document.querySelectorAll("button")].find(item => item.textContent === "go-config")
    ).toBe(button);
    expect(wire.models).not.toHaveBeenCalled();
    expect(wire.download).not.toHaveBeenCalled();
    expect(wire.stream).not.toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
  }
  await act(async () => button?.click());
  expect(confirmed).toHaveBeenCalledWith(request);
  expect(workflow.llmConfirm).toBeNull();
});

it("缺少本地模型时换语保留原识别语言与选项草稿，不重新加载目录", async () => {
  wire.models.mockResolvedValue({
    success: true,
    data: [{ name: "faster-whisper-base", downloaded: false }],
  });
  await render();
  await act(async () => workflow.transcribe(undefined, selection));
  const request = workflow.optionsRequest;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(workflow.optionsRequest).toBe(request);
    expect(request).toEqual({ language: "ja", initialSelection: selection });
    expect(wire.models).toHaveBeenCalledTimes(1);
    expect(wire.download).not.toHaveBeenCalled();
    expect(wire.extract).not.toHaveBeenCalled();
  }
});

it("AI断句与保存中换语不重开流或重复保存，优化提示与字幕原文保持", async () => {
  const provider = {
    id: "raw-provider",
    name: "服务商原名",
    baseUrl: "https://raw.example",
    api: "openai-completions" as const,
    models: [{ id: "raw-model", name: "模型原名", reasoning: false, input: ["text"] }],
  };
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      llmProviders: [provider] as never,
      llmUsageSettings: {
        ...state.setting.llmUsageSettings,
        transcriptionOptimization: { providerId: provider.id, modelId: provider.models[0].id },
      },
    },
  }));
  let complete!: (value: PiChatResult) => void;
  wire.stream.mockReturnValue({
    result: new Promise<PiChatResult>(resolve => {
      complete = resolve;
    }),
    cancel: wire.cancel,
  });
  let finishSave!: () => void;
  wire.save.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finishSave = resolve;
      })
  );
  await render({ language: "auto" });
  await act(async () => workflow.transcribe(undefined, { ...selection, optimize: true }));
  const prompt = wire.stream.mock.calls[0][0];
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(workflow.isOptimizing).toBe(true);
    expect(wire.stream).toHaveBeenCalledTimes(1);
    expect(wire.stream.mock.calls[0][0]).toBe(prompt);
    expect(wire.cancel).not.toHaveBeenCalled();
    expect(wire.save).not.toHaveBeenCalled();
  }
  await act(async () =>
    complete({
      ok: true,
      aborted: false,
      text: "00:00.000:原始优化句\n",
      reasoning: "",
      message: null,
    })
  );
  const saveArguments = wire.save.mock.calls[0];
  expect(saveArguments).toEqual([
    note.id,
    "原始优化句",
    [{ text: "原始优化句", start: 0, end: 2000 }],
    result.data?.wordSegments,
  ]);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(wire.save).toHaveBeenCalledTimes(1);
    expect(wire.stream).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  }
  await act(async () => finishSave());
  expect(saved).toHaveBeenCalledTimes(1);
});
