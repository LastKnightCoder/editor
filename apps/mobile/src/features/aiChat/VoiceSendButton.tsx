// 对话的语音输入（与微信一致）：输入框切到语音模式后变成整条「按住 说话」，
// 按住录音、上滑到 ✕ 取消、松手把识别结果直接发送。对话不经语音整理：模型能直接理解口语，省一次调用。

import { useRef } from "react";
import { cn } from "@tau/ui";
import { toast } from "../../components/toast";
import { DictationOverlay } from "../speechInput/DictationOverlay";
import { useDictationSession } from "../speechInput/useDictationSession";
import { useHoldGesture } from "../speechInput/useHoldGesture";
import { useSpeechInputService, useSpeechUnavailableReason } from "../speechInput/speechService";

const HINT_ID = "chat-voice-hint";

export function HoldToTalkBar(props: {
  disabled?: boolean;
  onSend(text: string): void;
  portalContainer?: HTMLElement | null;
}) {
  const cancelTargetRef = useRef<HTMLDivElement | null>(null);
  const service = useSpeechInputService();
  const unavailableReason = useSpeechUnavailableReason();
  const onSendRef = useRef(props.onSend);
  onSendRef.current = props.onSend;
  const session = useDictationSession({
    service,
    onPreview: () => undefined,
    onCommit: text => onSendRef.current(text),
    onError: error =>
      toast({ type: "error", text: error instanceof Error ? error.message : "语音输入失败" }),
  });
  const gesture = useHoldGesture(
    {
      onHoldStart: () => {
        if (props.disabled) return gesture.abort();
        if (unavailableReason) {
          gesture.abort();
          return toast.info({ id: HINT_ID, text: unavailableReason });
        }
        session.start();
      },
      onRelease: session.finish,
      onCancel: session.cancel,
      onTap: () =>
        toast.info({
          id: HINT_ID,
          text: unavailableReason ?? "按住说话，松手发送",
          duration: 1800,
        }),
    },
    cancelTargetRef
  );
  const active = session.phase === "connecting" || session.phase === "listening";
  const holding = gesture.holding;
  return (
    <>
      <button
        type="button"
        aria-label="按住说话"
        aria-pressed={holding}
        disabled={props.disabled}
        className={cn(
          "h-12 min-w-0 flex-1 rounded-[18px] text-[15.5px] font-semibold transition-colors select-none disabled:opacity-50",
          holding
            ? gesture.cancelArmed
              ? "bg-danger-soft text-danger"
              : "bg-accent-soft text-accent-text"
            : "bg-page text-ink-1"
        )}
        {...gesture.bind}
      >
        {holding ? (gesture.cancelArmed ? "松开 取消" : "松开 发送") : "按住 说话"}
      </button>
      <DictationOverlay
        open={holding && active}
        connecting={session.phase === "connecting"}
        startedAt={session.startedAt}
        cancelArmed={gesture.cancelArmed}
        releaseHint="松手发送"
        cancelTargetRef={cancelTargetRef}
        portalContainer={props.portalContainer}
      />
    </>
  );
}
