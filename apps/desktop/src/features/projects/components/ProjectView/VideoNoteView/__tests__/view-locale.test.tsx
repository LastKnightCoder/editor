import { act, createRef, forwardRef, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { VideoController } from "@/components/VideoNotePanel/VideoController";
import type { VideoNoteItem } from "@/types";
import type { NoteMarker } from "../noteMarkers";
const db = vi.hoisted(() => ({
  items: vi.fn(),
  content: vi.fn(),
  createContent: vi.fn(),
  createItem: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  editorMount: vi.fn(),
  editorUnmount: vi.fn(),
}));
vi.mock("@/commands", () => ({
  getVideoNoteItemsByVideoNoteId: db.items,
  getContentById: db.content,
  createContent: db.createContent,
  createVideoNoteItem: db.createItem,
  updateVideoNoteItem: db.update,
  deleteVideoNoteItem: db.remove,
}));
vi.mock("@/components/LocalVideo", () => ({ default: () => null }));
// Collaboration transport is outside this host; a stateful editor exposes host remounts.
vi.mock("@/components/ContentEditor", () => ({
  default: forwardRef(function Editor() {
    useEffect(() => {
      db.editorMount();
      return () => {
        db.editorUnmount();
      };
    }, []);
    return <textarea defaultValue="用户笔记草稿" />;
  }),
}));
import { MaterialColumn } from "../MaterialColumn";
import { NotesStage, type NotesStageHandle } from "../NotesStage";
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  desktopLocaleSource.setLocale("zh-CN");
});
async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(<I18nRuntimeProvider runtime={desktopI18n}>{node}</I18nRuntimeProvider>)
  );
}
it("观看中换语保留真实视频元素、播放数值与原字幕轨，不触发转录动作", async () => {
  const transcribe = vi.fn(async () => undefined);
  const mounted = vi.fn();
  const props: ComponentProps<typeof MaterialColumn> = {
    videoNote: {
      id: 7,
      createTime: 0,
      updateTime: 0,
      metaInfo: { type: "remote", url: "https://raw/video" },
      transcript: "原字幕",
      transcriptSegments: [{ text: "原字幕", start: 0, end: 1000 }],
    },
    source: {
      src: "/raw/video.mp4",
      ready: true,
      loading: false,
      error: null,
      useLocalVideo: false,
      loader: null,
    },
    transcription: {
      isTranscribing: false,
      progress: "",
      isOptimizing: false,
      streamingSegments: [],
      transcribe,
      canOptimize: false,
      optimize: vi.fn(),
      cancelOptimization: vi.fn(),
      optionsRequest: null,
      openOptions: vi.fn(),
      closeOptions: vi.fn(),
      llmConfirm: null,
      dismissLlmConfirm: vi.fn(),
    },
    subtitleTrackUrl: "blob:original-subtitle",
    subtitleLanguage: "ja",
    chapters: [{ start: 0, title: "原章节" }],
    chaptersGenerating: false,
    markers: [],
    quotedIndexes: new Set(),
    onVideoElement: mounted,
    onQuote: vi.fn(),
    onAsk: vi.fn(),
  };
  await mount(<MaterialColumn {...props} />);
  const video = host.querySelector("video");
  if (!video) throw new Error("missing video");
  const track = video.querySelector("track");
  if (!track) throw new Error("missing subtitle track");
  await act(async () => {
    video.currentTime = 42.5;
    video.volume = 0.3;
    video.playbackRate = 1.5;
  });
  const mounts = mounted.mock.calls.length;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("video")).toBe(video);
    expect(video.querySelector("track")).toBe(track);
    expect([video.currentTime, video.volume, video.playbackRate]).toEqual([42.5, 0.3, 1.5]);
    expect(track.getAttribute("src")).toBe("blob:original-subtitle");
    expect(track.getAttribute("srclang")).toBe("ja");
    expect(video.getAttribute("src")).toBe("/raw/video.mp4");
    expect(mounted.mock.calls.length).toBe(mounts);
    expect(transcribe).not.toHaveBeenCalled();
  }
});
it("笔记换语保留未保存标题、焦点选区与编辑器，标记只存原标题和序号", async () => {
  const item: VideoNoteItem = {
    id: 31,
    videoNoteId: 7,
    contentId: 81,
    title: "",
    createTime: 0,
    updateTime: 0,
  };
  db.items.mockResolvedValue([item]);
  db.content.mockResolvedValue({
    content: [
      {
        type: "paragraph",
        children: [{ type: "video-timestamp", time: 12, children: [{ text: "" }] }],
      },
    ],
  });
  const markers = vi.fn<(value: NoteMarker[]) => void>();
  await mount(
    <NotesStage
      videoNoteId={7}
      videoController={new VideoController(() => null)}
      onMarkersChange={markers}
    />
  );
  const title = host.querySelector("input");
  if (!title) throw new Error("missing title");
  const editor = host.querySelector("textarea");
  if (!editor) throw new Error("missing editor");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("missing native input setter");
    setter.call(title, "用户尚未保存的标题");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    title.focus();
    title.setSelectionRange(2, 5);
  });
  const reads = db.content.mock.calls.length;
  const original = markers.mock.calls.at(-1)?.[0];
  expect(original?.[0]).toMatchObject({ id: "31:0.0", time: 12, noteTitle: "", noteIndex: 0 });
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("input")).toBe(title);
    expect(title.value).toBe("用户尚未保存的标题");
    expect(document.activeElement).toBe(title);
    expect([title.selectionStart, title.selectionEnd]).toEqual([2, 5]);
    expect(host.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("用户笔记草稿");
    expect(db.items).toHaveBeenCalledTimes(1);
    expect(db.content).toHaveBeenCalledTimes(reads);
    expect(db.editorMount).toHaveBeenCalledTimes(1);
    expect(db.editorUnmount).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.createItem).not.toHaveBeenCalled();
  }
});
it("英文界面从转录摘录创建笔记时保留空标题、原句和秒级时间戳", async () => {
  desktopLocaleSource.setLocale("en-US");
  db.items.mockResolvedValue([]);
  db.content.mockResolvedValue(null);
  db.createContent.mockResolvedValue(81);
  db.createItem.mockResolvedValue({
    id: 31,
    videoNoteId: 7,
    contentId: 81,
    title: "",
    createTime: 0,
    updateTime: 0,
  });
  const ref = createRef<NotesStageHandle>();
  await mount(
    <NotesStage ref={ref} videoNoteId={7} videoController={new VideoController(() => null)} />
  );
  await act(async () => ref.current?.insertQuote("引用原文 Mixed", 12.5));
  expect(db.createItem).toHaveBeenCalledWith({ videoNoteId: 7, contentId: 81, title: "" });
  expect(db.createContent).toHaveBeenCalledWith(
    [
      {
        type: "blockquote",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "formatted", text: "" },
              { type: "video-timestamp", time: 12.5, children: [{ type: "formatted", text: "" }] },
              { type: "formatted", text: " 引用原文 Mixed" },
            ],
          },
        ],
      },
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ],
    0
  );
  expect(db.createItem).toHaveBeenCalledTimes(1);
  expect(db.update).not.toHaveBeenCalled();
});
