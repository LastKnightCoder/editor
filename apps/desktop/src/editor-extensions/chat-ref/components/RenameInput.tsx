import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from "react";
import { cn } from "@tau/ui";

/**
 * 引用改名的输入框：挂载即全选，↵ / 失焦保存，Esc 取消。
 * 放在编辑器 void 节点里时，事件不能冒泡给 Slate，否则键入会被当成正文编辑。
 */
export function RenameInput({
  initial,
  onCommit,
  onCancel,
  className,
  ariaLabel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(ref.current?.value ?? initial);
    else onCancel();
  };
  const isolate = (event: SyntheticEvent) => event.stopPropagation();
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label={ariaLabel}
      spellCheck={false}
      className={cn(
        "bg-surface text-ink-1 border-accent rounded-tau-sm min-w-0 border px-1.5 shadow-[var(--tau-focus-ring)] outline-none",
        className
      )}
      onKeyDown={onKeyDown}
      onKeyUp={isolate}
      onBeforeInput={isolate}
      onInput={isolate}
      onPaste={isolate}
      onCopy={isolate}
      onCut={isolate}
      onMouseDown={isolate}
      onClick={isolate}
      onDoubleClick={isolate}
      onBlur={() => finish(true)}
    />
  );
}
