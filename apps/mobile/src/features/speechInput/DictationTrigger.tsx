import { useEffect, useRef, type ReactNode } from "react";
import type { Editor } from "slate";
import type { SpeechRefiner } from "@tau/asr";
import { toast } from "../../components/toast";
import { DictationOverlay } from "./DictationOverlay";
import { PolishPill } from "./PolishPill";
import { useEditorDictation } from "./useEditorDictation";
import { useHoldGesture } from "./useHoldGesture";

const TAP_HINT_ID = "dictation-tap-hint";

export type DictationTriggerProps = {
  getEditor: () => Editor | null;
  mode: "point" | "end";
  /** AI 润色器；未配置 AI 时不传 */
  refine?: SpeechRefiner;
  portalContainer?: HTMLElement | null;
  /** 润色胶囊底边位置，缺省贴在配件栏上方 */
  pillBottom?: string;
  /** 失焦收键盘期间让调用方保留入口，避免中断正在跟踪的手势。 */
  onKeyboardSwapChange?: (active: boolean) => void;
  /** 按钮外观由入口决定（配件栏 / 阅读态悬浮），手势与事件由本组件绑定 */
  renderButton(props: {
    bind: ReturnType<typeof useHoldGesture>["bind"];
    active: boolean;
  }): ReactNode;
};

/** 按住说话入口：按钮 + 手势 + 沉浸区 + 润色胶囊 */
export function DictationTrigger(props: DictationTriggerProps) {
  const cancelTargetRef = useRef<HTMLDivElement | null>(null);
  const dictation = useEditorDictation({
    getEditor: props.getEditor,
    mode: props.mode,
    refine: props.refine,
    onKeyboardSwapChange: props.onKeyboardSwapChange,
  });
  // 识别服务不可用时按住也不进入录音，直接引导去设置
  const showUnavailable = (reason: string) =>
    toast({
      id: TAP_HINT_ID,
      type: "info",
      text: reason,
      action: dictation.openSettings
        ? { label: "去设置", onClick: dictation.openSettings }
        : undefined,
    });
  const gesture = useHoldGesture(
    {
      onHoldStart: () => {
        if (dictation.unavailableReason) {
          gesture.abort();
          showUnavailable(dictation.unavailableReason);
          return;
        }
        dictation.begin();
      },
      onRelease: dictation.finish,
      onCancel: dictation.cancel,
      onTap: () => {
        if (dictation.unavailableReason) return showUnavailable(dictation.unavailableReason);
        toast.info({
          id: TAP_HINT_ID,
          text: "按住说话，松手写入",
          duration: 1800,
        });
      },
    },
    cancelTargetRef
  );
  const { setCancelArmed } = dictation;
  // 手势层的取消判定同步给预览，正文里的预览文字随之变淡
  useEffect(() => setCancelArmed(gesture.cancelArmed), [gesture.cancelArmed, setCancelArmed]);

  return (
    <>
      {props.renderButton({ bind: gesture.bind, active: gesture.holding })}
      <DictationOverlay
        open={gesture.holding && dictation.active}
        connecting={dictation.phase === "connecting"}
        startedAt={dictation.startedAt}
        cancelArmed={gesture.cancelArmed}
        polishEnabled={dictation.polishEnabled}
        appendToEnd={props.mode === "end"}
        cancelTargetRef={cancelTargetRef}
        portalContainer={props.portalContainer}
        panelHeight={dictation.panelHeight}
      />
      <PolishPill
        state={dictation.pill}
        {...dictation.pillActions}
        bottom={props.pillBottom}
        portalContainer={props.portalContainer}
      />
    </>
  );
}
