import { act, forwardRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { legacyVideoT } from "../legacy.binding";
const wire = vi.hoisted(() => ({
  note: vi.fn(),
  items: vi.fn(),
  content: vi.fn(),
  saveTranscript: vi.fn(),
  saveTitle: vi.fn(),
  createItem: vi.fn(),
  remove: vi.fn(),
  transcribe: vi.fn(),
  upload: vi.fn(),
  editorMount: vi.fn(),
  editorUnmount: vi.fn(),
  ebookTitle: "",
}));
vi.mock("@/commands", () => ({
  getVideoNoteById: wire.note,
  getVideoNoteItemsByVideoNoteId: wire.items,
  getContentById: wire.content,
  updateVideoNoteTranscript: wire.saveTranscript,
  updateVideoNoteItem: wire.saveTitle,
  createVideoNoteItem: wire.createItem,
  deleteVideoNoteItem: wire.remove,
  createContent: vi.fn(),
}));
vi.mock("@/utils", async () => import("@/utils/time"));
vi.mock("@/editor-extensions", () => ({}));
vi.mock("@/hooks/useUploadResource", () => ({ default: () => wire.upload }));
vi.mock("@/hooks/useLLMConfig", () => ({ useLLMConfig: () => ({}) }));
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (state: { setting: { database: { active: string } } }) => unknown) =>
    select({ setting: { database: { active: "raw-library" } } }),
}));
vi.mock("../useVideoNoteChat", () => ({ useVideoNoteChat: () => "raw-tools" }));
vi.mock("../VideoNoteChatPanel", () => ({ default: () => null }));
vi.mock("../VideoNoteEpubExportModal", () => ({
  default: (props: { videoTitle: string }) => {
    wire.ebookTitle = props.videoTitle;
    return null;
  },
}));
vi.mock("../useVideoNoteTranscription", () => ({
  useVideoNoteTranscription: () => ({
    isTranscribing: false,
    progress: "",
    isOptimizing: false,
    streamingSegments: [],
    optionsRequest: null,
    openOptions: () => undefined,
    closeOptions: () => undefined,
    transcribe: wire.transcribe,
    optimize: () => undefined,
    cancelOptimization: () => undefined,
    llmConfirm: null,
    dismissLlmConfirm: () => undefined,
  }),
}));
vi.mock("@/components/ContentEditor", () => ({
  default: forwardRef(function Editor() {
    useEffect(() => {
      wire.editorMount();
      return () => {
        wire.editorUnmount();
      };
    }, []);
    return <textarea data-editor defaultValue="笔记正文草稿" />;
  }),
}));
import VideoNotePanel from "../VideoNotePanel";
let root: Root | undefined;
let host: HTMLDivElement;
const words = [{ text: "逐词原文", start: 0, end: 120 }];
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  wire.note.mockResolvedValue({
    id: 17,
    createTime: 0,
    updateTime: 0,
    metaInfo: { type: "local", filePath: "/raw/video.mp4" },
    transcript: "字幕原文",
    transcriptSegments: [{ text: "字幕原文", start: 0, end: 1000 }],
    transcriptWordSegments: words,
  });
  wire.items.mockResolvedValue([
    { id: 31, videoNoteId: 17, contentId: 81, title: "用户笔记标题", createTime: 0, updateTime: 0 },
  ]);
  wire.content.mockResolvedValue({
    content: [{ type: "paragraph", children: [{ type: "formatted", text: "用户正文" }] }],
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const video = document.createElement("video");
  video.currentTime = 42.5;
  const listen = vi.spyOn(video, "addEventListener");
  await act(async () =>
    root?.render(
      <VideoNotePanel videoNoteId={17} externalVideoElement={video} videoTitle="原视频名称" />
    )
  );
  return { video, listen };
}
async function clickLabel(key: Parameters<typeof legacyVideoT>[0]) {
  const text = legacyVideoT(key);
  const target = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === text || button.title === text
  );
  if (!target) throw new Error("missing action " + key);
  await act(async () => target.click());
  await act(async () => vi.advanceTimersByTimeAsync(300));
}
it("白板字幕编辑换语保留对话框草稿与原视频订阅，不重复提交或识别", async () => {
  const { video, listen } = await mount();
  const subscriptions = listen.mock.calls.length;
  await clickLabel("transcript.edit");
  const input = document.querySelector<HTMLTextAreaElement>("textarea");
  if (!input) throw new Error("missing transcript editor");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) throw new Error("missing setter");
    setter.call(input, "用户正在改字幕");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    input.setSelectionRange(2, 5);
  });
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("用户正在改字幕");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(document.activeElement).toBe(input);
    expect(video.currentTime).toBe(42.5);
    expect(listen.mock.calls.length).toBe(subscriptions);
    expect(wire.note).toHaveBeenCalledTimes(1);
    expect(wire.content).toHaveBeenCalledTimes(1);
    expect(wire.saveTranscript).not.toHaveBeenCalled();
    expect(wire.transcribe).not.toHaveBeenCalled();
    expect(wire.ebookTitle).toBe("原视频名称");
  }
});
it("白板笔记换语保留当前编辑卡片、未保存标题与正文编辑器", async () => {
  await mount();
  await clickLabel("tab.note");
  const card = host.querySelector<HTMLElement>('[role="button"]');
  if (!card) throw new Error("missing note card");
  await act(async () => card.click());
  const title = host.querySelector("input");
  const editor = host.querySelector<HTMLTextAreaElement>("[data-editor]");
  if (!title || !editor) throw new Error("missing note editor");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("missing setter");
    setter.call(title, "尚未保存的标题");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    title.focus();
    title.setSelectionRange(1, 3);
  });
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("input")).toBe(title);
    expect(title.value).toBe("尚未保存的标题");
    expect(document.activeElement).toBe(title);
    expect([title.selectionStart, title.selectionEnd]).toEqual([1, 3]);
    expect(host.querySelector("[data-editor]")).toBe(editor);
    expect(editor.value).toBe("笔记正文草稿");
    expect(wire.editorMount).toHaveBeenCalledTimes(1);
    expect(wire.editorUnmount).not.toHaveBeenCalled();
    expect(wire.items).toHaveBeenCalledTimes(1);
    expect(wire.content).toHaveBeenCalledTimes(1);
    expect(wire.saveTitle).not.toHaveBeenCalled();
    expect(wire.createItem).not.toHaveBeenCalled();
    expect(wire.transcribe).not.toHaveBeenCalled();
  }
});
