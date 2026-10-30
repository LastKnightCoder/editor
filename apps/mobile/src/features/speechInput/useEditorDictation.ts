import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Editor, Point, type PointRef } from "slate";
import { ReactEditor } from "slate-react";
import { createMobileSpeechInputService } from "../../services/speechInput";
import { useMobilePlugins } from "../../app/plugins/context";
import { useOptionalPageInstanceContext } from "../../router/pageLifecycle";
import { toast } from "../../components/toast";
import {
  getMobileSettingSnapshot,
  subscribeMobileSettingSnapshot,
} from "../../services/mobileSettingsBridge";
import type { SpeechInputService, SpeechRefiner } from "@tau/asr";
import { defaultSpeechInputSetting } from "@tau/asr";
import { commitDictation, type DictationCommit, type DictationTarget } from "./commitDictation";
import { setDictationPreview, splitPreviewText } from "./dictationPreview";
import { useDictationSession } from "./useDictationSession";
import type { PolishPillState } from "./PolishPill";

const services = new WeakMap<object, SpeechInputService>();

function useSpeechInputService(): SpeechInputService | null {
  const runtime = useMobilePlugins();
  if (!runtime) return null;
  let service = services.get(runtime.asr);
  if (!service) {
    service = createMobileSpeechInputService(runtime.asr);
    services.set(runtime.asr, service);
  }
  return service;
}

export type EditorDictationOptions = {
  getEditor: () => Editor | null;
  /** point：按下时的光标处插入；end：文末追加新段落（阅读态） */
  mode: "point" | "end";
  /** AI 润色器；未配置 AI 时不传，松手即写入 */
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

/** 写入后「撤销」提示的停留时长 */
const UNDO_TOAST_MS = 4000;

/**
 * 编辑器语音输入：锁定插入点、驱动识别会话、预览装饰与一次性写入，
 * 以及（传入润色器时）润色状态与原文切换。手势与沉浸区由调用方组合。
 */
export function useEditorDictation(options: EditorDictationOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const navigator = useOptionalPageInstanceContext()?.navigator;
  const setting = useSyncExternalStore(
    subscribeMobileSettingSnapshot,
    getMobileSettingSnapshot,
    getMobileSettingSnapshot
  );
  const service = useSpeechInputService();
  const [cancelArmed, setCancelArmedState] = useState(false);
  const [pill, setPill] = useState<PolishPillState | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const pointRef = useRef<PointRef | null>(null);
  const previewTextRef = useRef("");
  const commitRef = useRef<DictationCommit | null>(null);
  const originalRef = useRef("");
  const polishedRef = useRef("");
  const pillTimerRef = useRef<number | null>(null);
  const cancelArmedRef = useRef(false);

  const renderPreview = useCallback(() => {
    const editor = editorRef.current;
    const point = pointRef.current?.current;
    if (!editor) return;
    if (!point || !previewTextRef.current) return setDictationPreview(editor, null);
    setDictationPreview(editor, {
      point,
      ...splitPreviewText(previewTextRef.current),
      cancel: cancelArmedRef.current,
      asBlock: optionsRef.current.mode === "end",
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

  const showPill = useCallback((next: PolishPillState | null, autoHideMs?: number) => {
    if (pillTimerRef.current !== null) window.clearTimeout(pillTimerRef.current);
    pillTimerRef.current = null;
    setPill(next);
    if (next && autoHideMs)
      pillTimerRef.current = window.setTimeout(() => {
        setPill(null);
        commitRef.current?.rangeRef.unref();
        commitRef.current = null;
      }, autoHideMs);
  }, []);

  const showUndoToast = useCallback((commit: DictationCommit, text: string) => {
    toast({
      type: "success",
      text,
      duration: UNDO_TOAST_MS,
      action: { label: "撤销", onClick: () => commit.undo() },
    });
  }, []);

  const session = useDictationSession({
    service,
    refine: options.refine,
    onPreview: text => {
      previewTextRef.current = text;
      renderPreview();
    },
    onCommit: text => {
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
      if (optionsRef.current.refine) {
        showPill({ kind: "polishing" });
        return;
      }
      showUndoToast(commit, optionsRef.current.mode === "end" ? "已追加到文末" : "已插入");
      commit.rangeRef.unref();
      commitRef.current = null;
    },
    onPolished: (text, status) => {
      const commit = commitRef.current;
      if (!commit) return;
      if (status === "refined") {
        polishedRef.current = text;
        commit.replace(text);
        showPill({ kind: "refined", showingOriginal: false }, UNDO_TOAST_MS);
      } else {
        showPill({ kind: "failed" }, UNDO_TOAST_MS);
      }
    },
    onError: error => {
      releaseTarget();
      const message = error instanceof Error ? error.message : "语音输入失败";
      const notConfigured = /尚未配置/.test(message);
      toast({
        type: "error",
        text: message,
        action:
          notConfigured && navigator
            ? {
                label: "去设置",
                onClick: () => navigator.push("settingsModule", { module: "speech-input" }),
              }
            : undefined,
      });
    },
  });
  const openSettings = useMemo(
    () =>
      navigator ? () => navigator.push("settingsModule", { module: "speech-input" }) : undefined,
    [navigator]
  );

  const begin = useCallback(() => {
    const editor = optionsRef.current.getEditor();
    if (!editor) return;
    editorRef.current = editor;
    showPill(null);
    releaseCommit();
    const at =
      optionsRef.current.mode === "point" && editor.selection
        ? Point.isBefore(editor.selection.anchor, editor.selection.focus)
          ? editor.selection.focus
          : editor.selection.anchor
        : Editor.end(editor, []);
    pointRef.current = Editor.pointRef(editor, at);
    previewTextRef.current = "";
    if (optionsRef.current.mode === "end") scrollToEnd(editor);
    session.start();
  }, [releaseCommit, session, showPill]);

  const setCancelArmed = useCallback(
    (armed: boolean) => {
      cancelArmedRef.current = armed;
      setCancelArmedState(armed);
      renderPreview();
    },
    [renderPreview]
  );

  const cancel = useCallback(() => {
    session.cancel();
    releaseTarget();
    setCancelArmed(false);
  }, [releaseTarget, session, setCancelArmed]);

  const finish = useCallback(() => {
    setCancelArmed(false);
    session.finish();
  }, [session, setCancelArmed]);

  const pillActions = useMemo(
    () => ({
      onSkip: () => {
        session.skipPolish();
        const commit = commitRef.current;
        showPill(null);
        if (commit) showUndoToast(commit, "已插入原文");
        releaseCommit();
      },
      onToggleOriginal: () => {
        const commit = commitRef.current;
        if (!commit || pill?.kind !== "refined") return;
        const showingOriginal = !pill.showingOriginal;
        commit.replace(showingOriginal ? originalRef.current : polishedRef.current);
        showPill({ kind: "refined", showingOriginal }, UNDO_TOAST_MS);
      },
      onUndo: () => {
        commitRef.current?.undo();
        showPill(null);
        releaseCommit();
      },
      onRetry: () => {
        // 重新润色需要会话层支持，接入 AI 时补齐；目前只关闭提示
        showPill(null);
        releaseCommit();
      },
    }),
    [pill, releaseCommit, session, showPill, showUndoToast]
  );

  /** 不能开始录音的原因，可用时为 null；移动端识别只走插件，系统识别尚未接入 */
  const unavailableReason = useMemo(() => {
    const speech = setting?.speechInput ?? defaultSpeechInputSetting();
    if (speech.active === "native") return "手机端暂不支持系统识别，请选择识别插件";
    if (!speech.plugin.configurations[speech.plugin.id]) return "识别插件账号尚未配置";
    return null;
  }, [setting]);

  return {
    phase: session.phase,
    startedAt: session.startedAt,
    active: session.phase === "connecting" || session.phase === "listening",
    cancelArmed,
    setCancelArmed,
    polishEnabled: Boolean(options.refine),
    unavailableReason,
    openSettings,
    begin,
    finish,
    cancel,
    pill,
    pillActions,
  };
}

export type EditorDictation = ReturnType<typeof useEditorDictation>;
