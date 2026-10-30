import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, Point, type PointRef } from "slate";
import { ReactEditor } from "slate-react";
import type { SpeechRefiner } from "@tau/asr";
import { useOptionalPageInstanceContext } from "../../router/pageLifecycle";
import { commitDictation, type DictationCommit, type DictationTarget } from "./commitDictation";
import { setDictationPreview, splitPreviewText } from "./dictationPreview";
import { useDictationSession } from "./useDictationSession";
import {
  needsSpeechSettings,
  useSpeechInputService,
  useSpeechUnavailableReason,
} from "./speechService";

/** 识别文字这么久没有变化时提示「没听到声音」 */
export const QUIET_HINT_MS = 7_000;
/** 识别文字这么久没有变化时自动停止并写入 */
export const QUIET_STOP_MS = 10_000;

/** 面板顶部的结果条：上一段写入 / 润色的状态 */
export type VoiceResult =
  | { kind: "committed"; count: number }
  | { kind: "polishing" }
  | { kind: "refined"; showingOriginal: boolean }
  | { kind: "failed" };

export type VoiceError = { message: string; openSettings?: () => void };

export type VoiceDictationOptions = {
  getEditor: () => Editor | null;
  /** point：当前选区处插入；end：文末追加新段落（阅读态） */
  mode: "point" | "end";
  /** AI 润色器；未配置 AI 时不传，停止即写入 */
  refine?: SpeechRefiner;
};

/** 阅读态追加到文末：先把正文末尾滚进视口，预览文字出现在用户眼前 */
function scrollToEnd(editor: Editor) {
  const last = editor.children.at(-1);
  if (!last) return;
  try {
    ReactEditor.toDOMNode(editor, last).scrollIntoView({ block: "end", behavior: "smooth" });
  } catch {
    // 节点未挂载时不滚动
  }
}

function insertionPoint(editor: Editor, mode: "point" | "end"): Point {
  const selection = editor.selection;
  if (mode === "end" || !selection) return Editor.end(editor, []);
  return Point.isBefore(selection.anchor, selection.focus) ? selection.focus : selection.anchor;
}

/**
 * 语音面板的编辑器侧编排：在插入点预览识别文字、停止后一次写入，
 * 记录上一段供「撤回这段」，可选润色，长时间无新文字自动停止。可连续多段使用。
 */
export function useVoiceDictation(options: VoiceDictationOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const navigator = useOptionalPageInstanceContext()?.navigator;
  const service = useSpeechInputService();
  const unavailableReason = useSpeechUnavailableReason();
  const [cancelArmed, setCancelArmedState] = useState(false);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState<VoiceError | null>(null);
  const [quiet, setQuiet] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const pointRef = useRef<PointRef | null>(null);
  const previewTextRef = useRef("");
  const commitRef = useRef<DictationCommit | null>(null);
  const originalRef = useRef("");
  const polishedRef = useRef("");
  const cancelArmedRef = useRef(false);
  const quietTimersRef = useRef<number[]>([]);
  const finishRef = useRef<() => void>(() => undefined);

  const openSettings = useMemo(
    () =>
      navigator ? () => navigator.push("settingsModule", { module: "speech-input" }) : undefined,
    [navigator]
  );

  const clearQuietTimers = useCallback(() => {
    quietTimersRef.current.forEach(timer => window.clearTimeout(timer));
    quietTimersRef.current = [];
    setQuiet(false);
  }, []);

  const armQuietTimers = useCallback(() => {
    clearQuietTimers();
    quietTimersRef.current = [
      window.setTimeout(() => setQuiet(true), QUIET_HINT_MS),
      window.setTimeout(() => finishRef.current(), QUIET_STOP_MS),
    ];
  }, [clearQuietTimers]);

  const renderPreview = useCallback(() => {
    const editor = editorRef.current;
    const point = pointRef.current?.current;
    if (!editor) return;
    if (!point || (!previewTextRef.current && optionsRef.current.mode === "point"))
      return setDictationPreview(editor, null);
    setDictationPreview(editor, {
      point,
      ...splitPreviewText(previewTextRef.current),
      cancel: cancelArmedRef.current,
      asBlock: optionsRef.current.mode === "end",
      // 编辑态正文保持焦点、有系统光标；阅读态没有，由预览画出落点
      caret: optionsRef.current.mode === "end",
    });
  }, []);

  const releaseTarget = useCallback(() => {
    const editor = editorRef.current;
    if (editor) setDictationPreview(editor, null);
    pointRef.current?.unref();
    pointRef.current = null;
    previewTextRef.current = "";
  }, []);

  const releaseCommit = useCallback(() => {
    commitRef.current?.rangeRef.unref();
    commitRef.current = null;
  }, []);

  const session = useDictationSession({
    service,
    refine: options.refine,
    onPreview: text => {
      previewTextRef.current = text;
      renderPreview();
      armQuietTimers();
    },
    onCommit: text => {
      clearQuietTimers();
      const editor = editorRef.current;
      const pointTarget = pointRef.current;
      const target: DictationTarget =
        optionsRef.current.mode === "point" && pointTarget
          ? { kind: "point", pointRef: pointTarget }
          : { kind: "end" };
      if (editor) setDictationPreview(editor, null);
      const commit = editor ? commitDictation(editor, target, text) : null;
      releaseTarget();
      if (!commit) return;
      releaseCommit();
      commitRef.current = commit;
      originalRef.current = text;
      setResult(
        optionsRef.current.refine
          ? { kind: "polishing" }
          : { kind: "committed", count: text.replace(/\s/g, "").length }
      );
    },
    onPolished: (text, status) => {
      const commit = commitRef.current;
      if (!commit) return;
      if (status === "refined") {
        polishedRef.current = text;
        commit.replace(text);
        setResult({ kind: "refined", showingOriginal: false });
      } else {
        setResult({ kind: "failed" });
      }
    },
    onError: cause => {
      clearQuietTimers();
      releaseTarget();
      const message = cause instanceof Error ? cause.message : "语音输入失败";
      setError({
        message,
        openSettings: needsSpeechSettings(message) ? openSettings : undefined,
      });
    },
  });

  const begin = useCallback((): boolean => {
    if (unavailableReason) return false;
    const editor = optionsRef.current.getEditor();
    if (!editor) return false;
    editorRef.current = editor;
    setError(null);
    setResult(null);
    releaseCommit();
    pointRef.current = Editor.pointRef(editor, insertionPoint(editor, optionsRef.current.mode));
    previewTextRef.current = "";
    if (optionsRef.current.mode === "end") scrollToEnd(editor);
    renderPreview();
    armQuietTimers();
    session.start();
    return true;
  }, [armQuietTimers, releaseCommit, renderPreview, session, unavailableReason]);

  const setCancelArmed = useCallback(
    (armed: boolean) => {
      cancelArmedRef.current = armed;
      setCancelArmedState(armed);
      renderPreview();
    },
    [renderPreview]
  );

  const cancel = useCallback(() => {
    clearQuietTimers();
    session.cancel();
    releaseTarget();
    setCancelArmed(false);
  }, [clearQuietTimers, releaseTarget, session, setCancelArmed]);

  const finish = useCallback(() => {
    clearQuietTimers();
    setCancelArmed(false);
    session.finish();
  }, [clearQuietTimers, session, setCancelArmed]);
  finishRef.current = finish;

  /** 撤回上一段（含润色），正文回到这段写入前 */
  const undoLast = useCallback(() => {
    session.skipPolish();
    commitRef.current?.undo();
    releaseCommit();
    setResult(null);
  }, [releaseCommit, session]);

  /** 在插入点另起一段，连续口述时分段用 */
  const newline = useCallback(() => {
    const editor = optionsRef.current.getEditor();
    if (!editor) return;
    if (!editor.selection) editor.select(Editor.end(editor, []));
    Editor.insertBreak(editor);
    releaseCommit();
    setResult(null);
  }, [releaseCommit]);

  const skipPolish = useCallback(() => {
    session.skipPolish();
    const original = originalRef.current;
    setResult({ kind: "committed", count: original.replace(/\s/g, "").length });
  }, [session]);

  const toggleOriginal = useCallback(() => {
    const commit = commitRef.current;
    if (!commit || result?.kind !== "refined") return;
    const showingOriginal = !result.showingOriginal;
    commit.replace(showingOriginal ? originalRef.current : polishedRef.current);
    setResult({ kind: "refined", showingOriginal });
  }, [result]);

  useEffect(
    () => () => {
      quietTimersRef.current.forEach(timer => window.clearTimeout(timer));
      const editor = editorRef.current;
      if (editor) setDictationPreview(editor, null);
      pointRef.current?.unref();
      commitRef.current?.rangeRef.unref();
    },
    []
  );

  return {
    phase: session.phase,
    startedAt: session.startedAt,
    active: session.phase === "connecting" || session.phase === "listening",
    cancelArmed,
    setCancelArmed,
    quiet,
    result,
    error,
    unavailableReason,
    openSettings,
    begin,
    finish,
    cancel,
    undoLast,
    newline,
    skipPolish,
    toggleOriginal,
  };
}

export type VoiceDictation = ReturnType<typeof useVoiceDictation>;
