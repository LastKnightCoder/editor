import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, type Descendant, type Element } from "slate";
import { withHistory } from "slate-history";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import type { PendingRecording, RecordingEvent } from "../../../../services/recording";
import { mobileLocaleSource } from "../../../../services/i18n";
import { getQueryClient } from "../../../../router/query/PageQueryProvider";
import { RecordingCapsule } from "../RecordingCapsule";
import { RecordingRecoveryBanner } from "../RecordingRecoveryBanner";
import { TranscriptionUnavailableSheet } from "../TranscriptionUnavailableSheet";
import { recordingT } from "../recording.binding";
import { useRecordingLeaveGuard } from "../useRecordingLeaveGuard";
import {
  cancelEditorRecording,
  getRecordingState,
  startEditorRecording,
} from "../recordingSession";
import {
  closeTranscriptionUnavailable,
  transcribeAudioBlock,
  useTranscriptionUnavailable,
  type TranscriptionUnavailable,
} from "../transcription";

const native = vi.hoisted(() => ({
  startRecording: vi.fn<(typeof import("../../../../services/recording"))["startRecording"]>(),
  stopRecording: vi.fn<(typeof import("../../../../services/recording"))["stopRecording"]>(),
  pauseRecording: vi.fn<(typeof import("../../../../services/recording"))["pauseRecording"]>(),
  resumeRecording: vi.fn<(typeof import("../../../../services/recording"))["resumeRecording"]>(),
  cancelRecording: vi.fn<(typeof import("../../../../services/recording"))["cancelRecording"]>(),
  discardRecording: vi.fn<(typeof import("../../../../services/recording"))["discardRecording"]>(),
  pendingRecordings:
    vi.fn<(typeof import("../../../../services/recording"))["pendingRecordings"]>(),
  recoverRecording: vi.fn<(typeof import("../../../../services/recording"))["recoverRecording"]>(),
  prepareTranscriptAudio: vi.fn(),
  releaseTranscriptAudio: vi.fn(),
  readTranscriptAudio: vi.fn(),
}));
vi.mock("../../../../services/recording", () => native);

let root: Root;
let host: HTMLDivElement;
let portal: HTMLDivElement;
let recordingEvent: ((event: RecordingEvent) => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  native.startRecording.mockImplementation(async (_target, _title, onEvent) => {
    recordingEvent = onEvent;
    return { id: "raw-recording-id" };
  });
  native.cancelRecording.mockResolvedValue(undefined);
  native.discardRecording.mockResolvedValue(undefined);
  native.pendingRecordings.mockResolvedValue([]);
  native.recoverRecording.mockResolvedValue({
    src: "raw-recording.m4a",
    durationMs: 12000,
    sizeBytes: 1000,
  });
  getQueryClient().clear();
  host = document.createElement("div");
  portal = document.createElement("div");
  document.body.append(host, portal);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  await cancelEditorRecording();
  closeTranscriptionUnavailable();
  getQueryClient().clear();
  host.remove();
  portal.remove();
  mobileLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
const click = async (element: HTMLElement | undefined | null) => {
  if (!element) throw new Error("missing action");
  await act(async () => element.click());
};
function createDocument() {
  const editor = withHistory(createEditor());
  editor.isVoid = node => node.type === "audio";
  editor.children = [{ type: "paragraph", children: [{ text: "正文原文" }] }] as Descendant[];
  return editor;
}

it("换语保留进行中的录音、展开面板与离开确认，不代替用户完成或放弃", async () => {
  const editor = createDocument();
  const editorRef = { current: { getEditor: () => editor } as EditorRef };
  const persistence = {
    prepareResource: (src: string) => src,
    flush: vi.fn(async () => undefined),
  };
  await startEditorRecording({
    editor,
    document: "content:7",
    documentTitle: "文档原名",
    persistence,
    onPermissionDenied: vi.fn(),
  });
  recordingEvent?.({ id: "raw-recording-id", type: "level", elapsedMs: 12000, level: 0.2 });
  const initial = getRecordingState();
  let guard!: ReturnType<typeof useRecordingLeaveGuard>;
  function View() {
    guard = useRecordingLeaveGuard(editorRef);
    return (
      <>
        <RecordingCapsule aboveToolbar={false} portalRoot={portal} />
        {guard.sheets}
      </>
    );
  }
  await act(async () => root.render(<View />));
  let leaving!: Promise<boolean>;
  await act(async () => {
    leaving = guard.confirmLeave();
  });
  const continueAction = button(recordingT("action.resumeRecording"));
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(button(recordingT("action.resumeRecording"))).toBe(continueAction);
    expect(getRecordingState()).toBe(initial);
    expect(native.startRecording).toHaveBeenCalledTimes(1);
    expect(native.stopRecording).not.toHaveBeenCalled();
    expect(native.cancelRecording).not.toHaveBeenCalled();
    expect(persistence.flush).not.toHaveBeenCalled();
  }
  await click(continueAction);
  expect(await leaving).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(300));
  await click(document.querySelector(`[aria-label="${recordingT("panel.expand")}"]`));
  const finish = button(recordingT("action.finishInsert"));
  if (!finish) throw new Error("missing expanded recording panel");
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(button(recordingT("action.finishInsert"))).toBe(finish);
    expect(getRecordingState()).toBe(initial);
    expect(native.stopRecording).not.toHaveBeenCalled();
  }
});

it("恢复录音在换语时保留同一保存任务与原标题，耐久保存后才删除旁注", async () => {
  const editor = createDocument();
  const pending: PendingRecording = {
    id: "pending-id",
    target: { document: "content:7", afterText: "正文原文" },
    title: "用户录音原名",
    startedAt: 1,
    durationMs: 12000,
  };
  native.pendingRecordings.mockResolvedValueOnce([pending]).mockResolvedValueOnce([]);
  let finish!: () => void;
  const persistence = {
    prepareResource: vi.fn(() => "mapped-resource"),
    flush: vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    ),
  };
  const ref = { current: { getEditor: () => editor } as EditorRef };
  await act(async () =>
    root.render(
      <RecordingRecoveryBanner
        document="content:7"
        editorRef={ref}
        editable
        persistence={() => persistence}
      />
    )
  );
  await act(async () => vi.advanceTimersByTimeAsync(0));
  const insert = button(recordingT("recovery.insert"));
  await click(insert);
  const block = editor.children.find(node => node.type === "audio");
  expect(block).toMatchObject({ src: "mapped-resource", title: pending.title });
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(button(recordingT("recovery.insert"))).toBe(insert);
    expect(insert?.disabled).toBe(true);
    expect(native.pendingRecordings).toHaveBeenCalledTimes(1);
    expect(native.recoverRecording).toHaveBeenCalledTimes(1);
    expect(native.recoverRecording).toHaveBeenCalledWith(pending.id);
    expect(persistence.flush).toHaveBeenCalledTimes(1);
    expect(native.discardRecording).not.toHaveBeenCalled();
    expect(editor.children.find(node => node.type === "audio")).toBe(block);
  }
  await act(async () => finish());
  expect(native.discardRecording).toHaveBeenCalledWith(pending.id);
});

it("不可用说明换语保留语义原因与面板，不重新请求录音或识别", async () => {
  const editor = createDocument();
  const audio = { type: "audio", src: "raw-audio", children: [{ text: "" }] } as Element;
  await transcribeAudioBlock(editor, null, audio);
  let state: TranscriptionUnavailable | null = null;
  function View() {
    state = useTranscriptionUnavailable();
    return <TranscriptionUnavailableSheet />;
  }
  await act(async () => root.render(<View />));
  const initial = state;
  if (!initial) throw new Error("missing unavailable reason");
  const cancel = button(recordingT("action.cancel"));
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(state).toBe(initial);
    expect(button(recordingT("action.cancel"))).toBe(cancel);
    expect(native.startRecording).not.toHaveBeenCalled();
    expect(native.prepareTranscriptAudio).not.toHaveBeenCalled();
  }
  await click(cancel);
  expect(state).toBeNull();
});
