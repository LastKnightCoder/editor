import { useRecordingI18n } from "./recording.i18n";
import { discardConfirmText, formatRecordingTime } from "./recording.format";
import { useCallback, useRef, useState, type RefObject } from "react";
import type { Editor as SlateEditor } from "slate";
import type { EditorRef } from "@tau/editor";
import { ActionSheet } from "../../../components/ActionSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import {
  cancelEditorRecording,
  discardNeedsConfirm,
  finishEditorRecording,
  getRecordingState,
  recordingDestinationFor,
} from "./recordingSession";

type Choice = "finish" | "discard" | "continue";

/**
 * 录音中离开文档前确认：完成并插入 / 放弃录音 / 继续录音。
 * 录音与文档绑定，离开后落点无处可插；切 App、锁屏不算离开，不经这里。
 */
export function useRecordingLeaveGuard(editorRef: RefObject<EditorRef | null>) {
  const context = useRecordingI18n();
  const { t, locale } = context;
  const [open, setOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscardState] = useState(false);
  const resolveRef = useRef<((choice: Choice) => void) | null>(null);
  // 动作面板先回调选项、退场后才回调 onClose，用 ref 避免 onClose 读到旧的确认状态
  const confirmingRef = useRef(false);
  const setConfirmingDiscard = (value: boolean) => {
    confirmingRef.current = value;
    setConfirmingDiscardState(value);
  };

  const settle = (choice: Choice) => {
    setOpen(false);
    setConfirmingDiscard(false);
    resolveRef.current?.(choice);
    resolveRef.current = null;
  };

  /** 可以离开返回 true；录音由本文档持有时先让用户选 */
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    const editor = editorRef.current?.getEditor() as SlateEditor | undefined;
    if (!editor || !recordingDestinationFor(editor)) return true;
    const choice = await new Promise<Choice>(resolve => {
      resolveRef.current?.("continue");
      resolveRef.current = resolve;
      setOpen(true);
    });
    if (choice === "continue") return false;
    if (choice === "discard") await cancelEditorRecording();
    else await finishEditorRecording();
    return true;
  }, [editorRef]);

  const state = getRecordingState();
  const sheets = (
    <>
      <ActionSheet
        open={open && !confirmingDiscard}
        title={
          state
            ? t("leave.elapsed", { duration: formatRecordingTime(state.elapsedMs, locale) })
            : t("leave.title")
        }
        subtitle={t("leave.hint")}
        groups={[
          [
            { key: "finish", label: t("action.finishInsert"), onClick: () => settle("finish") },
            {
              key: "discard",
              label: t("leave.discard"),
              danger: true,
              onClick: () => {
                const current = getRecordingState();
                if (current && discardNeedsConfirm(current)) setConfirmingDiscard(true);
                else settle("discard");
              },
            },
          ],
          [
            {
              key: "continue",
              label: t("action.resumeRecording"),
              onClick: () => settle("continue"),
            },
          ],
        ]}
        onClose={() => {
          if (!confirmingRef.current) settle("continue");
        }}
      />
      <MobileConfirmDialog
        open={confirmingDiscard}
        title={t("discard.title")}
        description={state ? discardConfirmText(state, context) : undefined}
        confirmText={t("action.discard")}
        danger
        onCancel={() => settle("continue")}
        onConfirm={() => settle("discard")}
      />
    </>
  );

  return { confirmLeave, sheets };
}
