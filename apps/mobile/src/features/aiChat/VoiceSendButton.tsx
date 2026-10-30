// 对话里的按住说话：与编辑器听写同一套手势与沉浸区（按住录、上滑取消），松手把识别结果直接发送。
// 对话不经语音整理：模型能直接理解口语，省一次调用。

import { useRef, type ReactNode } from "react";
import { toast } from "../../components/toast";
import { DictationOverlay } from "../speechInput/DictationOverlay";
import { useDictationSession } from "../speechInput/useDictationSession";
import { useHoldGesture } from "../speechInput/useHoldGesture";
import { useSpeechInputService } from "../speechInput/speechService";

const TAP_HINT_ID = "chat-voice-hint";

export function VoiceSendButton(props: {
  disabled?: boolean;
  onSend(text: string): void;
  onPreview?(text: string): void;
  portalContainer?: HTMLElement | null;
  renderButton(props: {
    bind: ReturnType<typeof useHoldGesture>["bind"];
    active: boolean;
  }): ReactNode;
}) {
  const cancelTargetRef = useRef<HTMLDivElement | null>(null);
  const service = useSpeechInputService();
  const onSendRef = useRef(props.onSend);
  onSendRef.current = props.onSend;
  const onPreviewRef = useRef(props.onPreview);
  onPreviewRef.current = props.onPreview;
  const session = useDictationSession({
    service,
    onPreview: text => onPreviewRef.current?.(text),
    onCommit: text => {
      onPreviewRef.current?.("");
      onSendRef.current(text);
    },
    onError: error => {
      onPreviewRef.current?.("");
      toast({ type: "error", text: error instanceof Error ? error.message : "语音输入失败" });
    },
  });
  const gesture = useHoldGesture(
    {
      onHoldStart: () => {
        if (props.disabled) return gesture.abort();
        session.start();
      },
      onRelease: session.finish,
      onCancel: () => {
        session.cancel();
        onPreviewRef.current?.("");
      },
      onTap: () => toast.info({ id: TAP_HINT_ID, text: "按住说话，松手发送", duration: 1800 }),
    },
    cancelTargetRef
  );
  const active = session.phase === "connecting" || session.phase === "listening";
  return (
    <>
      {props.renderButton({ bind: gesture.bind, active: gesture.holding })}
      <DictationOverlay
        open={gesture.holding && active}
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
