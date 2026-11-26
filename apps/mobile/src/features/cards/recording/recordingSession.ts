import { recordingT, recordingDisplayContext } from "./recording.binding";
import { formatRecordingTime, recordingErrorText } from "./recording.format";
import { useSyncExternalStore } from "react";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Transforms,
} from "slate";
import { ReactEditor } from "slate-react";
import { toast } from "../../../components/toast";
import * as recording from "../../../services/recording";
import { persistRecording, type RecordingPersistence } from "./recordingPersistence";
import {
  captureRecordingAnchor,
  captureReplaceDestination,
  commitRecording,
  defaultRecordingTitle,
  disposeDestination,
  type RecordingDestination,
  type RecordingReplace,
} from "./recordingTarget";

/** 单段录音上限 */
export const RECORDING_LIMIT_MS = 3 * 60 * 60 * 1000;
/** 到上限前多久提示 */
export const RECORDING_WARN_BEFORE_MS = 5 * 60 * 1000;
/** 开始前剩余空间低于此提示 */
const LOW_SPACE_BEFORE_BYTES = 200 * 1024 * 1024;
/** 录音中剩余空间低于此自动完成 */
const LOW_SPACE_STOP_BYTES = 50 * 1024 * 1024;
/** 放弃超过此时长的录音需要再确认 */
export const DISCARD_CONFIRM_MS = 10 * 1000;
/** 胶囊与面板的电平条数 */
const LEVEL_HISTORY = 120;

export type RecordingPauseReason = "user" | "interruption" | "route";

export type RecordingPhase = "starting" | "recording" | "paused" | "saving";

export type RecordingState = {
  phase: RecordingPhase;
  id: string | null;
  title: string;
  /** 所属文档的名称，面板里显示 */
  documentTitle: string;
  elapsedMs: number;
  levels: readonly number[];
  pauseReason: RecordingPauseReason | null;
  freeBytes: number | null;
  /** 新插还是重新录制 */
  kind: RecordingDestination["kind"];
};

type Session = {
  state: RecordingState;
  editor: SlateEditor;
  destination: RecordingDestination;
  persistence: RecordingPersistence;
  startedAt: number;
  warned: boolean;
  /** 自动完成只触发一次 */
  finishing: Promise<void> | null;
};

let session: Session | null = null;
/** 落点标记装饰的重算订阅：只在录音开始、结束、阶段变化时通知，计时由标记组件自己订阅 */
const markerListeners = new WeakMap<SlateEditor, Set<() => void>>();

function notifyRecordingMarker(editor: SlateEditor) {
  markerListeners.get(editor)?.forEach(listener => listener());
}

export function subscribeRecordingMarker(editor: SlateEditor, listener: () => void) {
  let set = markerListeners.get(editor);
  if (!set) markerListeners.set(editor, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}
let snapshot: RecordingState | null = null;
const listeners = new Set<() => void>();

function emit() {
  snapshot = session ? session.state : null;
  listeners.forEach(listener => listener());
}

function update(patch: Partial<RecordingState>) {
  if (!session) return;
  const phaseChanged = patch.phase !== undefined && patch.phase !== session.state.phase;
  session.state = { ...session.state, ...patch };
  emit();
  if (phaseChanged) notifyRecordingMarker(session.editor);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getRecordingState = () => snapshot;

export function useRecordingState(): RecordingState | null {
  return useSyncExternalStore(subscribe, getRecordingState, getRecordingState);
}

/** 录音所属编辑器与落点；标记装饰据此绘制 */
export function recordingDestinationFor(editor: SlateEditor): RecordingDestination | null {
  return session && session.editor === editor ? session.destination : null;
}

function permissionDenied(error: unknown) {
  return String(error).includes("PERMISSION_DENIED");
}

export type StartRecordingOptions = {
  editor: SlateEditor;
  /** 所属文档 key，如 `content:12`；找回按它匹配 */
  document: string;
  documentTitle: string;
  persistence: RecordingPersistence;
  /** 重新录制时传入原音频块 */
  replace?: RecordingReplace;
  onPermissionDenied: () => void;
};

export async function startEditorRecording(options: StartRecordingOptions): Promise<void> {
  if (session) {
    toast.warning(recordingT("session.busy"));
    return;
  }
  const destination = options.replace
    ? captureReplaceDestination(options.editor, options.replace)
    : { kind: "insert" as const, anchor: captureRecordingAnchor(options.editor) };
  if (!destination) {
    toast.warning(recordingT("session.targetMissing"));
    return;
  }
  const startedAt = Date.now();
  const title = defaultRecordingTitle(startedAt);
  session = {
    editor: options.editor,
    destination,
    persistence: options.persistence,
    startedAt,
    warned: false,
    finishing: null,
    state: {
      phase: "starting",
      id: null,
      title,
      documentTitle: options.documentTitle,
      elapsedMs: 0,
      levels: [],
      pauseReason: null,
      freeBytes: null,
      kind: destination.kind,
    },
  };
  emit();
  notifyRecordingMarker(options.editor);
  const current = session;
  try {
    const afterText = destination.kind === "insert" ? destination.anchor.afterText : undefined;
    const started = await recording.startRecording(
      { document: options.document, afterText },
      title,
      event => handleEvent(current, event)
    );
    if (session !== current) {
      void recording.cancelRecording(started.id);
      return;
    }
    update({ phase: "recording", id: started.id, freeBytes: started.freeBytes ?? null });
    if (started.freeBytes != null && started.freeBytes < LOW_SPACE_BEFORE_BYTES) {
      toast.warning(recordingT("session.lowSpace"));
    }
  } catch (error) {
    clear(current);
    if (permissionDenied(error)) options.onPermissionDenied();
    else toast.error(recordingErrorText(error, "session.startFailed", recordingDisplayContext()));
  }
}

function handleEvent(owner: Session, event: recording.RecordingEvent) {
  if (session !== owner || owner.state.id !== event.id) return;
  switch (event.type) {
    case "level": {
      const levels = [...owner.state.levels, event.level].slice(-LEVEL_HISTORY);
      update({
        elapsedMs: event.elapsedMs,
        levels,
        freeBytes: event.freeBytes ?? owner.state.freeBytes,
      });
      if (!owner.warned && event.elapsedMs >= RECORDING_LIMIT_MS - RECORDING_WARN_BEFORE_MS) {
        owner.warned = true;
        toast.warning(recordingT("session.limitWarning"));
      }
      if (event.elapsedMs >= RECORDING_LIMIT_MS) {
        void finishEditorRecording("limit");
      } else if (event.freeBytes != null && event.freeBytes < LOW_SPACE_STOP_BYTES) {
        void finishEditorRecording("low-space");
      }
      break;
    }
    case "paused":
      update({ phase: "paused", pauseReason: event.reason, elapsedMs: event.elapsedMs });
      break;
    case "resumed":
      update({ phase: "recording", pauseReason: null, elapsedMs: event.elapsedMs });
      break;
    case "error":
      toast.error(event.message);
      void finishEditorRecording();
      break;
  }
}

export async function toggleRecordingPause(): Promise<void> {
  const current = session;
  if (!current?.state.id) return;
  try {
    if (current.state.phase === "recording") await recording.pauseRecording(current.state.id);
    else if (current.state.phase === "paused") await recording.resumeRecording(current.state.id);
  } catch (error) {
    toast.error(recordingErrorText(error, "session.operationFailed", recordingDisplayContext()));
  }
}

function clear(owner: Session) {
  if (session !== owner) return;
  disposeDestination(owner.destination);
  session = null;
  emit();
  notifyRecordingMarker(owner.editor);
}

function flashBlock(editor: SlateEditor, uuid: string) {
  requestAnimationFrame(() => {
    const entry = editor.children.find(
      node => SlateElement.isElement(node) && (node as { uuid?: string }).uuid === uuid
    );
    if (!entry) return;
    try {
      const dom = ReactEditor.toDOMNode(editor as ReactEditor, entry as SlateNode);
      dom.dataset.recordingFlash = "";
      window.setTimeout(() => delete dom.dataset.recordingFlash, 1500);
    } catch {
      // 块未渲染（虚拟化或已离屏）
    }
  });
}

/** 撤销这次插入：只删这一块，不回退用户录音期间写的内容 */
function removeInserted(editor: SlateEditor, uuid: string) {
  const index = editor.children.findIndex(
    node => SlateElement.isElement(node) && (node as { uuid?: string }).uuid === uuid
  );
  if (index >= 0) Transforms.removeNodes(editor, { at: [index] });
}

/** 停止并写入文档；`notice` 为自动完成的原因 */
export function finishEditorRecording(notice?: "limit" | "low-space"): Promise<void> {
  const current = session;
  if (!current?.state.id) return Promise.resolve();
  if (current.finishing) return current.finishing;
  const id = current.state.id;
  const run = (async () => {
    update({ phase: "saving" });
    let stored: recording.StoredRecording;
    try {
      stored = await recording.stopRecording(id);
    } catch (error) {
      clear(current);
      if (String(error).includes("RECORDING_TOO_SHORT")) toast.info(recordingT("session.tooShort"));
      else
        toast.error(
          recordingT("session.recoverLater", {
            error: recordingErrorText(error, "session.saveFailed", recordingDisplayContext()),
          })
        );
      return;
    }
    const { editor, destination, state } = current;
    let uuid: string | null = null;
    try {
      uuid = await persistRecording(current.persistence, id, stored.src, src => {
        const path = commitRecording(editor, destination, src, state.title);
        return (SlateNode.get(editor, path) as { uuid?: string }).uuid ?? null;
      });
    } catch {
      clear(current);
      toast.error(recordingT("session.documentFailed"));
      return;
    }
    clear(current);
    const context = recordingDisplayContext();
    const duration = formatRecordingTime(stored.durationMs || state.elapsedMs, context.locale);
    const noticeText = notice ? recordingT(`notice.${notice}`) : undefined;
    if (destination.kind === "replace") {
      toast({ type: "success", text: noticeText ?? recordingT("session.replaced", { duration }) });
      return;
    }
    if (!uuid) {
      toast({
        type: notice ? "warning" : "success",
        text: noticeText ?? recordingT("session.inserted", { duration }),
      });
      return;
    }
    const inserted = uuid;
    flashBlock(editor, inserted);
    toast({
      type: notice ? "warning" : "success",
      text: noticeText ?? recordingT("session.inserted", { duration }),
      duration: 4000,
      action: { label: recordingT("action.undo"), onClick: () => removeInserted(editor, inserted) },
    });
  })();
  current.finishing = run;
  return run;
}

export async function cancelEditorRecording(): Promise<void> {
  const current = session;
  if (!current) return;
  const id = current.state.id;
  clear(current);
  if (id) await recording.cancelRecording(id).catch(() => undefined);
}

export function isRecordingActive() {
  return session !== null;
}

/** 放弃确认文案：短录音直接放弃 */
export function discardNeedsConfirm(state: RecordingState) {
  return state.elapsedMs >= DISCARD_CONFIRM_MS;
}
