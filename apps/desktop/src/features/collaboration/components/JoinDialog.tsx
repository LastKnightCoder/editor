/**
 * 加入协作：12 位协作码分三段输入，整段粘贴自动分段，满 12 位回车提交；
 * 提交后需要作者同意，结果经 Notification / 侧栏子项体现，这里只报「已发出」。
 */

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Button, Dialog, DialogBody, Input } from "@tau/ui";
import { joinCollaboration } from "@/commands";

const SEGMENTS = 3;
const SEGMENT_LENGTH = 4;
const CODE_LENGTH = SEGMENTS * SEGMENT_LENGTH;
const PLACEHOLDERS = ["K7QX", "M3AZ", "9BCD"];

const clean = (value: string) => value.replace(/[^0-9a-z]/gi, "").toUpperCase();

export function JoinDialog({
  open,
  onOpenChange,
  nickname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nickname: string;
}) {
  const [segments, setSegments] = useState<string[]>(() => Array(SEGMENTS).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const code = segments.join("");

  const fill = (raw: string, from: number) => {
    const text = clean(raw).slice(0, CODE_LENGTH - from * SEGMENT_LENGTH);
    setSegments(prev => {
      const next = [...prev];
      for (let i = from; i < SEGMENTS; i++) {
        const part = text.slice((i - from) * SEGMENT_LENGTH, (i - from + 1) * SEGMENT_LENGTH);
        if (i === from || part) next[i] = part;
      }
      return next;
    });
    setError(undefined);
    const filled = from + Math.floor(text.length / SEGMENT_LENGTH);
    if (text.length >= SEGMENT_LENGTH) inputs.current[Math.min(SEGMENTS - 1, filled)]?.focus();
  };

  const submit = async () => {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await joinCollaboration(code);
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "申请失败");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Backspace" && !segments[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };
  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const text = clean(event.clipboardData.getData("text"));
    if (text.length <= SEGMENT_LENGTH) return;
    event.preventDefault();
    fill(text, index);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => {
        setSegments(Array(SEGMENTS).fill(""));
        setError(undefined);
        setSent(false);
      }}
      locked={busy}
      title={sent ? "申请已发出" : "加入协作"}
      subtitle={sent ? undefined : "向内容作者要一个 12 位协作码，提交后需要对方同意。"}
      footer={
        sent ? (
          <Button variant="primary" data-autofocus onClick={() => onOpenChange(false)}>
            好的
          </Button>
        ) : (
          <>
            <span className="text-ink-3 text-tau-sm mr-auto truncate">
              以「{nickname}」的身份申请
            </span>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={busy}
              loadingText="正在提交…"
              disabled={code.length !== CODE_LENGTH}
              onClick={() => void submit()}
            >
              申请加入
            </Button>
          </>
        )
      }
    >
      <DialogBody>
        {sent ? (
          <div className="flex items-start gap-3 py-1">
            <span className="bg-ok-soft text-ok grid size-8 flex-none place-items-center rounded-full">
              <Check className="size-4" strokeWidth={2} />
            </span>
            <p className="text-ink-2 text-tau-body">
              作者同意后，这份内容会出现在侧栏「协作」下的「我加入的」里。可以先关掉这个窗口。
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              {segments.map((value, index) => (
                <div key={index} className="contents">
                  {index > 0 && <span className="text-ink-3">–</span>}
                  <Input
                    ref={element => {
                      inputs.current[index] = element;
                    }}
                    data-autofocus={index === 0 || undefined}
                    aria-label={`协作码第 ${index + 1} 段`}
                    value={value}
                    placeholder={PLACEHOLDERS[index]}
                    maxLength={SEGMENT_LENGTH}
                    spellCheck={false}
                    autoComplete="off"
                    wrapperClassName="h-11 min-w-0 flex-1"
                    className="font-tau-mono placeholder:text-ink-3/60 text-center text-[17px] uppercase tracking-[0.22em]"
                    onChange={event => fill(event.target.value, index)}
                    onKeyDown={onKeyDown(index)}
                    onPaste={onPaste(index)}
                  />
                </div>
              ))}
            </div>
            {error ? (
              <p
                role="alert"
                className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm mt-3 px-3 py-2"
              >
                {error}
              </p>
            ) : (
              <p className="text-ink-3 text-tau-sm mt-2">可以直接粘贴整段协作码，会自动分段。</p>
            )}
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
