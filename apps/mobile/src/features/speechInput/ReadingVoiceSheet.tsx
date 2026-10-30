import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Editor } from "slate";
import type { SpeechRefiner } from "@tau/asr";
import { Z_INDEX } from "../../router/zIndex";
import { useSheetBackDismiss } from "../../router/useSheetBackDismiss";
import { VoicePanel } from "./VoicePanel";
import { useVoiceDictation } from "./useVoiceDictation";

/** 抽屉内语音面板高度：面板本体加顶部「追加到文末」一行 */
const SHEET_PANEL_HEIGHT = 272;
const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";

export type ReadingVoiceSheetProps = {
  open: boolean;
  getEditor: () => Editor | null;
  onClose: () => void;
  refine?: SpeechRefiner;
  portalContainer?: HTMLElement | null;
};

/** 阅读态语音抽屉：打开即开始录音，追加到文末，可连续说多段；关闭不进入编辑 */
export function ReadingVoiceSheet(props: ReadingVoiceSheetProps) {
  if (!props.open) return null;
  return <OpenSheet {...props} />;
}

function OpenSheet(props: ReadingVoiceSheetProps) {
  const { getEditor, onClose, refine, portalContainer } = props;
  const dictation = useVoiceDictation({ getEditor, mode: "end", refine });
  const { begin, active, finish } = dictation;

  // 打开抽屉的目的已经明确，直接开始说
  useEffect(() => {
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 抽屉遮住的正文末尾经滚动留白让出来
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(OCCLUSION_VAR, `${SHEET_PANEL_HEIGHT}px`);
    return () => {
      root.style.removeProperty(OCCLUSION_VAR);
    };
  }, []);

  const close = () => {
    if (active) finish();
    onClose();
  };
  useSheetBackDismiss(true, close);

  return createPortal(
    <div
      data-reading-voice-sheet=""
      className="shadow-float fixed inset-x-0 bottom-0 rounded-t-[24px]"
      style={{ zIndex: Z_INDEX.POPOVER }}
    >
      <VoicePanel
        dictation={dictation}
        height={SHEET_PANEL_HEIGHT}
        hideNewline
        className="rounded-t-[24px] pt-9"
        header={
          <div className="text-ink-3 absolute inset-x-4 top-2.5 flex items-center text-[12px]">
            追加到<b className="text-ink-1 ml-1 font-semibold">文末</b>
            <button
              type="button"
              aria-label="关闭语音输入"
              className="text-ink-2 active:bg-press ml-auto flex h-8 w-8 items-center justify-center rounded-full"
              onClick={close}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        }
      />
    </div>,
    portalContainer ?? document.body
  );
}
