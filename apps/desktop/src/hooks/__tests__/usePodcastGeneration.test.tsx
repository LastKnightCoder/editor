import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePodcastGeneration } from "../usePodcastGeneration";
import type { ITTSProvider } from "@/types/tts";
import { SpeakerRole } from "@/types/podcast";
import { readBinaryFile, getHomeDir } from "@/commands";
const mocks = vi.hoisted(() => ({
  selected: null as ITTSProvider | null,
  upload: vi.fn(),
  requests: [] as unknown[],
  save: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/hooks/useLLMConfig", () => ({
  useLLMConfig: () => ({ provider: { id: "p" }, model: { id: "m" } }),
}));
vi.mock("@/utils/tts", () => ({
  TTSProviderFactory: {
    getTTSProvider: () => mocks.selected,
    getSpeechSynthesizer: () => mocks.selected?.synthesis,
    getActiveProviderType: () => "test",
  },
}));
vi.mock("@/hooks/useUploadResource", () => ({ default: () => mocks.upload }));
vi.mock("@/commands/podcast-audio", () => ({
  saveTempSegment: mocks.save,
  replacePodcastSegment: mocks.replace,
}));
vi.mock("@/commands", () => ({ readBinaryFile: vi.fn(), getHomeDir: vi.fn() }));
vi.mock("@/utils/resouce", () => ({ remoteResourceToLocal: vi.fn() }));
vi.mock("@/services/podcast", () => ({
  parseScript: () =>
    ["one", "fail", "three"].map(text => ({
      speaker: "A",
      text,
      voiceId: text,
      startTime: 0,
      duration: 0,
    })),
}));
vi.mock("@/services/generation-orchestrator", () => ({
  runGenerationTask: (
    _p: unknown,
    _m: unknown,
    request: unknown,
    callbacks: { onUpdate(text: string): void; onFinish(): void }
  ) => {
    mocks.requests.push(request);
    callbacks.onUpdate("script");
    callbacks.onFinish();
  },
}));
vi.mock("@/utils/audio-processor", () => ({
  loadSpeechSegment: async (_ctx: unknown, data: ArrayBuffer) => ({ data, duration: 1 }),
  speechSegmentToBlob: (segment: { data: ArrayBuffer }) => new Blob([segment.data]),
  mergeSpeechSegments: async (_ctx: unknown, segments: unknown[]) => ({
    blob: new Blob(["audio"]),
    duration: segments.length,
    ext: "wav",
  }),
}));
let api: ReturnType<typeof usePodcastGeneration>,
  root: ReturnType<typeof createRoot>,
  container: HTMLDivElement;
const bytes = () => ({ audio: new Uint8Array([0, 255]), mime: "audio/mpeg" });
function provider(name: string) {
  const controller = new AbortController();
  const synthesizeSpeech = vi.fn(async (text: string) => {
    if (text === "fail") throw new Error("单句失败");
    return bytes();
  });
  const value: ITTSProvider = {
    getProviderName: () => name,
    isConfigured: () => true,
    getTextInstructions: async () => name,
    synthesis: {
      signal: controller.signal,
      getVoiceList: async () => [],
      synthesizeSpeech,
      dispose: vi.fn(async () => {}),
    },
  };
  return { value, controller, synthesizeSpeech };
}
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.requests = [];
  mocks.upload.mockResolvedValue("https://files.test/episode.wav");
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "AudioContext",
    class {
      close = vi.fn(async () => {});
    }
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
function Harness() {
  api = usePodcastGeneration();
  return null;
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("脚本与音频固定同一账号，失败片段保留空位，重生成替换正确行", async () => {
  const a = provider("a"),
    b = provider("b");
  mocks.selected = a.value;
  await act(async () => {
    await api.generatePodcast({
      content: "source",
      speakers: [
        { name: "A", voiceId: "one", voiceName: "a", role: SpeakerRole.Host },
        { name: "B", voiceId: "three", voiceName: "b", role: SpeakerRole.Guest },
      ],
      generateMusic: false,
    });
  });
  mocks.selected = b.value;
  await act(async () => {
    await api.continueWithTTS(api.scriptLines, false);
  });
  expect(
    (mocks.requests[0] as { taskPayload: { ttsPromptOptions: unknown } }).taskPayload
      .ttsPromptOptions
  ).toEqual({ textInstructions: "a" });
  expect(a.synthesizeSpeech).toHaveBeenCalledTimes(3);
  expect(b.synthesizeSpeech).not.toHaveBeenCalled();
  expect(api.segmentAudios).toHaveLength(3);
  expect(api.segmentAudios[1]).toBeNull();
  expect(api.scriptLines.map(line => [line.startTime, line.duration])).toEqual([
    [0, 1],
    [1, 0],
    [1, 1],
  ]);
  await act(async () => {
    await api.regenerateSegment(1, "fixed");
  });
  expect(b.synthesizeSpeech.mock.calls[0]).toEqual([
    "fixed",
    "fail",
    undefined,
    expect.any(AbortSignal),
  ]);
  expect(api.scriptLines.map(line => [line.startTime, line.duration])).toEqual([
    [0, 1],
    [1, 1],
    [2, 1],
  ]);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("会话在上传期间关闭，迟到上传结果不能把任务标记为完成", async () => {
  const current = provider("a");
  mocks.selected = current.value;
  let finish!: (url: string) => void;
  mocks.upload.mockImplementation(
    () =>
      new Promise<string>(resolve => {
        finish = resolve;
      })
  );
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = api.continueWithTTS(
      [{ speaker: "A", text: "one", voiceId: "v", startTime: 0, duration: 0 }],
      false
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  current.controller.abort();
  expect(mocks.upload.mock.calls[0][1].aborted).toBe(true);
  await act(async () => {
    finish("https://files.test/late.wav");
    await pending;
  });
  expect(api.status).not.toBe("complete");
  expect(api.audioUrl).toBeNull();
});
it("重生成等待中reset，迟到音频不覆盖新的编辑状态", async () => {
  const current = provider("a");
  mocks.selected = current.value;
  let finish!: (value: ReturnType<typeof bytes>) => void;
  current.synthesizeSpeech.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  await act(async () =>
    api.setInitialState({
      audioUrl: "https://files.test/old.wav",
      scriptLines: [{ speaker: "A", text: "old", voiceId: "v", startTime: 0, duration: 1 }],
      segmentAudios: [new Blob(["old"])],
    })
  );
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = api.regenerateSegment(0, "new");
    await Promise.resolve();
  });
  await act(async () => api.reset());
  await act(async () => {
    finish(bytes());
    await pending;
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(api.audioUrl).toBeNull();
  expect(api.scriptLines).toEqual([]);
});
it("历史播客无缓存片段时复用宿主FFmpeg替换，并调整后续时间轴", async () => {
  mocks.selected = provider("a").value;
  mocks.save.mockResolvedValue({ tempPath: "/tmp/new.wav" });
  mocks.replace.mockResolvedValue({ outputPath: "/tmp/replaced.mp3" });
  vi.mocked(getHomeDir).mockResolvedValue("/home");
  vi.mocked(readBinaryFile).mockResolvedValue(new Uint8Array([1, 2]));
  await act(async () =>
    api.setInitialState({
      audioUrl: "~/resources/old.mp3",
      duration: 4,
      scriptLines: [
        { speaker: "A", text: "old", voiceId: "v", startTime: 0, duration: 2 },
        { speaker: "B", text: "next", voiceId: "b", startTime: 2, duration: 2 },
      ],
      segmentAudios: [],
    })
  );
  await act(async () => {
    await api.regenerateSegment(0, "new");
  });
  expect(mocks.replace).toHaveBeenCalledWith("/home/resources/old.mp3", "/tmp/new.wav", 0, 2);
  expect(api.scriptLines.map(line => [line.startTime, line.duration])).toEqual([
    [0, 1],
    [1, 2],
  ]);
  expect(api.duration).toBe(3);
  expect(mocks.upload.mock.calls[0][0].type).toBe("audio/mpeg");
});
