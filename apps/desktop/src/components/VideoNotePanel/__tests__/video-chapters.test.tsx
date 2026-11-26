import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { VideoNote } from "@/types";
const wire = vi.hoisted(() => ({
  complete: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  provider: { id: "original-provider" },
  model: { id: "original-model" },
}));
vi.mock("@/hooks/useLLMConfig", () => ({
  useLLMConfig: () => ({ provider: wire.provider, model: wire.model, thinkingLevel: "high" }),
}));
vi.mock("@/services/piLLM", () => ({ piCompleteChat: wire.complete }));
vi.mock("@/commands", () => ({ updateVideoNoteInsights: wire.save }));
vi.mock("@tau/ui", async original => {
  const actual = await original<typeof import("@tau/ui")>();
  return { ...actual, toast: { ...actual.toast, success: wire.success, error: wire.error } };
});
import { hashTranscript, useVideoNoteChapters } from "../useVideoNoteChapters";
let root: Root | undefined;
let host: HTMLDivElement;
let client: QueryClient;
const segments = [
  { text: "原始字幕一", start: 0, end: 1000 },
  { text: "Original subtitle two", start: 2000, end: 3000 },
];
const note: VideoNote = {
  id: 71,
  createTime: 0,
  updateTime: 0,
  metaInfo: { type: "remote", url: "https://raw/video" },
  transcriptSegments: segments,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  wire.save.mockResolvedValue(undefined);
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client.clear();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});
async function mount(videoNote: VideoNote, onSaved: ReturnType<typeof vi.fn>) {
  let current!: ReturnType<typeof useVideoNoteChapters>;
  function View() {
    useSyncExternalStore(desktopI18n.subscribe, desktopI18n.getSnapshot, desktopI18n.getSnapshot);
    current = useVideoNoteChapters({ videoNote, busy: false, onSaved });
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>
    )
  );
  return () => current;
}
const settle = () =>
  act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
it("自动生成挂起时换语不重发模型请求，章节仍按原字幕坐标和原名称保存", async () => {
  let finish!: (value: { ok: true; text: string }) => void;
  wire.complete.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const saved = vi.fn();
  const current = await mount(note, saved);
  expect(wire.complete).toHaveBeenCalledTimes(1);
  const request = wire.complete.mock.calls[0][0];
  const originalMessages = JSON.stringify(request.messages);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(wire.complete).toHaveBeenCalledTimes(1);
    expect(wire.save).not.toHaveBeenCalled();
    expect(JSON.stringify(wire.complete.mock.calls[0][0].messages)).toBe(originalMessages);
  }
  await act(async () =>
    finish({
      ok: true,
      text: JSON.stringify({
        chapters: [
          { start: 2100, title: "原章节二", summary: "原概要" },
          { start: 100, title: "Original chapter one" },
        ],
      }),
    })
  );
  await settle();
  expect(wire.save).toHaveBeenCalledTimes(1);
  const [id, insights] = wire.save.mock.calls[0];
  expect(id).toBe(71);
  expect(insights).toMatchObject({
    version: 2,
    transcriptHash: hashTranscript(segments),
    chapters: [
      { start: 0, title: "Original chapter one", summary: "" },
      { start: 2000, title: "原章节二", summary: "原概要" },
    ],
  });
  expect(saved).toHaveBeenCalledWith(insights);
  expect(current().generating).toBe(false);
  expect(request.provider).toBe(wire.provider);
  expect(request.model).toBe(wire.model);
  expect(request.thinking).toBe("high");
  expect(request.source).toEqual({ feature: "videoSummary", entityId: "71" });
  expect(wire.success).not.toHaveBeenCalled();
});
it("手动生成失败保留原诊断，不因换语重试、再次反馈或保存无效章节", async () => {
  const fresh = {
    ...note,
    insights: {
      version: 2 as const,
      transcriptHash: hashTranscript(segments),
      generatedAt: 0,
      chapters: [],
    },
  };
  let finish!: (value: { ok: true; text: string }) => void;
  wire.complete.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const current = await mount(fresh, vi.fn());
  expect(wire.complete).not.toHaveBeenCalled();
  await act(async () => current().regenerate());
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  await act(async () => finish({ ok: true, text: '{"chapters":null}' }));
  await settle();
  expect(wire.complete).toHaveBeenCalledTimes(1);
  expect(wire.save).not.toHaveBeenCalled();
  expect(wire.error).toHaveBeenCalledTimes(1);
  const error = client.getMutationCache().getAll().at(-1)?.state.error;
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("章节格式不正确");
  expect(error).toHaveProperty("code", "format");
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  await settle();
  expect(wire.error).toHaveBeenCalledTimes(1);
  expect(wire.complete).toHaveBeenCalledTimes(1);
  expect(wire.save).not.toHaveBeenCalled();
});
