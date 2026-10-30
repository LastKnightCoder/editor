// 输入区：右侧一个位置三种状态——空内容为按住说话、有文字为发送、生成中为停止。
// 按住说话的实时字幕写在输入框占位处，松手直接发送。

import { useRef, useState } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@tau/ui";
import { VoiceSendButton } from "./VoiceSendButton";

const ROUND_BUTTON =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform active:scale-90";

export function ChatComposer(props: {
  running: boolean;
  disabled?: boolean;
  placeholder?: string;
  onSend(text: string): void;
  onStop(): void;
}) {
  const [value, setValue] = useState("");
  const [voicePreview, setVoicePreview] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const text = value.trim();

  const submit = () => {
    if (!text || props.running || props.disabled) return;
    setValue("");
    props.onSend(text);
    // 发送后收起键盘，让回答占满屏幕
    inputRef.current?.blur();
  };

  const trailing = props.running ? (
    <button
      type="button"
      aria-label="停止生成"
      onClick={props.onStop}
      className={cn(ROUND_BUTTON, "bg-ink-1 text-ink-inverse")}
    >
      <Square size={13} fill="currentColor" aria-hidden="true" />
    </button>
  ) : text ? (
    <button
      type="button"
      aria-label="发送"
      disabled={props.disabled}
      onClick={submit}
      className={cn(ROUND_BUTTON, "bg-accent text-ink-inverse disabled:opacity-50")}
    >
      <ArrowUp size={18} strokeWidth={2.4} aria-hidden="true" />
    </button>
  ) : (
    <VoiceSendButton
      disabled={props.disabled}
      onSend={props.onSend}
      onPreview={setVoicePreview}
      renderButton={({ bind, active }) => (
        <button
          type="button"
          aria-label="按住说话"
          aria-pressed={active}
          className={cn(
            ROUND_BUTTON,
            "select-none",
            active ? "bg-accent text-ink-inverse scale-95" : "bg-page text-ink-1"
          )}
          {...bind}
        >
          <Mic size={18} aria-hidden="true" />
        </button>
      )}
    />
  );

  return (
    <div
      className="bg-page shrink-0 px-3 pt-2"
      style={{ paddingBottom: "calc(var(--mobile-screen-safe-bottom) + 10px)" }}
    >
      <div className="bg-surface shadow-card flex items-end gap-2 rounded-[22px] py-1.5 pr-1.5 pl-4">
        <textarea
          ref={inputRef}
          rows={1}
          value={voicePreview || value}
          readOnly={!!voicePreview}
          placeholder={props.placeholder ?? "发消息，或按住麦克风说话"}
          onChange={event => setValue(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className={cn(
            "text-tau-body placeholder:text-ink-3 field-sizing-content max-h-32 min-h-9 flex-1 resize-none bg-transparent py-[7px] leading-[1.45] outline-none",
            voicePreview ? "text-ink-3" : "text-ink-1"
          )}
        />
        {trailing}
      </div>
    </div>
  );
}
