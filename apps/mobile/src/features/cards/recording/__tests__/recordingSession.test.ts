import { afterEach, expect, it, vi } from "vitest";
import { createEditor, Transforms, type Descendant, type Element } from "slate";
import { withHistory } from "slate-history";
import {
  cancelEditorRecording,
  finishEditorRecording,
  getRecordingState,
  startEditorRecording,
} from "../recordingSession";
import { persistRecording } from "../recordingPersistence";

const native = vi.hoisted(() => ({
  startRecording: vi.fn(async () => ({ id: "recording-id" })),
  stopRecording: vi.fn(async () => ({
    src: "~/.editor/resources/recording.m4a",
    durationMs: 2000,
    sizeBytes: 16000,
  })),
  cancelRecording: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  discardRecording: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock("../../../../services/recording", () => native);
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  })
);
vi.mock("../../../../components/toast", () => ({ toast }));

afterEach(async () => {
  await cancelEditorRecording();
  vi.clearAllMocks();
});

const paragraph = (text: string) => ({ type: "paragraph", children: [{ text }] });
const reference = "tau-collab-local:00000000-0000-0000-0000-000000000000";

it.each([false, true])(
  "录音写入映射后的引用，保存完成前不删除找回旁注（替换：%s）",
  async replace => {
    const editor = withHistory(createEditor());
    editor.isVoid = node => node.type === "audio";
    editor.children = [
      replace
        ? { type: "audio", src: "old.mp3", title: "自定义标题", children: [{ text: "" }] }
        : paragraph("正文"),
      paragraph("后续编辑"),
    ] as Descendant[];
    Transforms.select(editor, { path: [1, 0], offset: 2 });
    const selection = editor.selection;
    let saved: () => void = vi.fn();
    const persistence = {
      prepareResource: vi.fn(() => reference),
      flush: vi.fn(
        () =>
          new Promise<void>(resolve => {
            saved = resolve;
          })
      ),
    };
    await startEditorRecording({
      editor,
      document: "content:1",
      documentTitle: "正文",
      persistence,
      replace: replace ? { element: editor.children[0] as Element, path: [0] } : undefined,
      onPermissionDenied: vi.fn(),
    });
    const finishing = finishEditorRecording();
    await vi.waitFor(() => expect(persistence.flush).toHaveBeenCalledOnce());
    expect(persistence.prepareResource).toHaveBeenCalledWith("~/.editor/resources/recording.m4a");
    expect(native.discardRecording).not.toHaveBeenCalled();
    const block = editor.children[replace ? 0 : 2];
    expect(block).toMatchObject({ type: "audio", src: reference });
    if (replace) expect(block).toMatchObject({ title: "自定义标题" });
    expect(editor.selection).toEqual(selection);
    saved();
    await finishing;
    expect(native.discardRecording).toHaveBeenCalledWith("recording-id");
    expect(getRecordingState()).toBeNull();
  }
);

it("正文保存失败保留找回旁注", async () => {
  const editor = createEditor();
  editor.children = [paragraph("正文")] as Descendant[];
  await startEditorRecording({
    editor,
    document: "content:1",
    documentTitle: "正文",
    onPermissionDenied: vi.fn(),
    persistence: {
      prepareResource: () => reference,
      flush: async () => {
        throw new Error("disk full");
      },
    },
  });
  await finishEditorRecording();
  expect(native.discardRecording).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("可以找回"));
});

it("找回录音的正文保存失败也保留旁注", async () => {
  const write = vi.fn();
  await expect(
    persistRecording(
      {
        prepareResource: () => reference,
        flush: async () => {
          throw new Error("disk full");
        },
      },
      "recovery-id",
      "local.m4a",
      write
    )
  ).rejects.toThrow("disk full");
  expect(write).toHaveBeenCalledWith(reference);
  expect(native.discardRecording).not.toHaveBeenCalled();
});
