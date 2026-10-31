import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { VideoNote } from "@/types";
import { currentCommandScope } from "@/services/command-context";
import { useVideoNoteCaptions } from "../useVideoNoteCaptions";

const mocks = vi.hoisted(() => ({ call: vi.fn(), save: vi.fn(), database: "captions.db" }));
vi.mock("@/commands/plugin-video", () => ({ callPluginVideo: mocks.call }));
vi.mock("@/commands/video-notes", () => ({ importVideoNoteCaptions: mocks.save }));
vi.mock("@/hooks/useVideoProviders", () => ({
  useVideoProviders: () => ({ providers: [{ id: "video.test" }] }),
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (value: unknown) => unknown) =>
    select({ setting: { database: { active: mocks.database } } }),
}));

const note: VideoNote = {
  id: 1,
  createTime: 1,
  updateTime: 2,
  metaInfo: { type: "video.test", id: "a" },
};
const captions = { language: "zh", segments: [{ text: "字幕", start: 0, end: 1000 }] };
const saved: VideoNote = { ...note, transcript: "字幕", transcriptSegments: captions.segments };
let cleanup: (() => void) | undefined;

function render(initial: VideoNote, manual = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const root = createRoot(document.createElement("div"));
  function Harness({ value, transcribing }: { value: VideoNote; transcribing: boolean }) {
    useVideoNoteCaptions(value, transcribing, onSaved);
    return null;
  }
  const rerender = (value: VideoNote, transcribing = manual) =>
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness value={value} transcribing={transcribing} />
        </QueryClientProvider>
      )
    );
  cleanup = () => {
    act(() => root.unmount());
    client.clear();
  };
  rerender(initial);
  return { rerender, onSaved };
}

const settle = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.resetAllMocks();
  mocks.database = "captions.db";
});

it("空白笔记自动读取字幕并绑定原库保存，无需音频或模型配置", async () => {
  mocks.call.mockResolvedValue(captions);
  mocks.save.mockImplementation(async () => {
    expect(currentCommandScope()?.databaseName).toBe("captions.db");
    return saved;
  });
  const view = render(note);
  await settle();
  expect(mocks.call).toHaveBeenCalledWith(
    { kind: "captions", pluginId: "video.test", ref: { id: "a" } },
    expect.any(AbortSignal)
  );
  expect(mocks.save).toHaveBeenCalledWith(1, 2, captions);
  expect(view.onSaved).toHaveBeenCalledWith({
    transcript: "字幕",
    transcriptSegments: captions.segments,
    transcriptWordSegments: undefined,
  });
});

it.each([null, new Error("读取失败")])(
  "无字幕或读取失败时保留空白，不写入结果：%s",
  async value => {
    if (value instanceof Error) mocks.call.mockRejectedValue(value);
    else mocks.call.mockResolvedValue(value);
    const view = render(note);
    await settle();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(view.onSaved).not.toHaveBeenCalled();
  }
);

it("已有结果、本地视频或用户手动转录时不读取平台字幕", async () => {
  const view = render(saved);
  await settle();
  view.rerender({ ...note, metaInfo: { type: "local", filePath: "/v.mp4" } });
  await settle();
  view.rerender(note, true);
  await settle();
  expect(mocks.call).not.toHaveBeenCalled();
});

it("切换笔记后中止旧读取，迟到结果不写库也不回填新笔记", async () => {
  let finish!: (value: typeof captions) => void;
  let signal!: AbortSignal;
  mocks.call.mockImplementation((_request, scoped) => {
    signal = scoped;
    return new Promise(resolve => {
      finish = resolve;
    });
  });
  const view = render(note);
  await settle();
  view.rerender({ ...note, id: 2, metaInfo: { type: "local", filePath: "/b.mp4" } });
  expect(signal.aborted).toBe(true);
  finish(captions);
  await settle();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(view.onSaved).not.toHaveBeenCalled();
});
