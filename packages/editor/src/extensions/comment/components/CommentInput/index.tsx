import React, { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@tau/ui";

interface CommentInputProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit: (content: string) => void;
  /** 有 onCancel 即为行内形态（编辑 / 回复）：底部「取消 · 保存」，Esc 先退出本输入框 */
  onCancel?: () => void;
  submitText?: string;
  autoFocus?: boolean;
  /** 浮层打开时的初始焦点（Popover 找 [data-autofocus]） */
  popoverAutoFocus?: boolean;
  className?: string;
}

/**
 * 批注输入框：常态 surface 底 + 细线，聚焦只换 accent 线与焦点环；高度随内容增长，⌘/Ctrl+↵ 发送。
 */
const CommentInput: React.FC<CommentInputProps> = ({
  placeholder = "写下你的想法…",
  initialValue = "",
  onSubmit,
  onCancel,
  submitText = "保存",
  autoFocus = false,
  popoverAutoFocus = false,
  className,
}) => {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inline = Boolean(onCancel);
  const canSubmit = value.trim().length > 0;

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // 推迟到下一轮任务：新建批注时工具条按钮会先把焦点还给编辑器，同步聚焦会被抢回去
  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const handleSubmit = () => {
    const content = value.trim();
    if (!content) return;
    onSubmit(content);
    setValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    } else if (event.key === "Escape" && onCancel) {
      // 行内输入框先消费 Esc，不连带关掉整个批注浮层
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      className={cn(
        "rounded-[12px] border border-solid border-[var(--ed-border)] bg-[var(--ed-bg-surface)] transition-[border-color,box-shadow] duration-150",
        "focus-within:border-[var(--ed-accent)] focus-within:shadow-[var(--ed-focus-ring)]",
        inline && "rounded-[10px]",
        className
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        data-autofocus={popoverAutoFocus || undefined}
        onChange={event => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "block max-h-40 min-h-[30px] w-full resize-none border-none bg-transparent px-3 pt-2 text-[13.5px] leading-[1.6] text-[var(--ed-text)] outline-none [field-sizing:content] placeholder:text-[var(--ed-text-tertiary)]",
          inline && "px-2.5 pt-1.5"
        )}
      />

      {inline ? (
        <div className="flex justify-end gap-1.5 px-1.5 pb-1.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-[26px] cursor-pointer rounded-[7px] border-none bg-transparent px-2.5 text-[12.5px] text-[var(--ed-text-secondary)] transition-colors hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-[26px] cursor-pointer rounded-[7px] border-none bg-[var(--ed-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ed-text-inverse)] transition-colors hover:bg-[var(--ed-accent-hover)] disabled:cursor-default disabled:bg-[var(--ed-bg-press)] disabled:text-[var(--ed-text-tertiary)]"
          >
            {submitText}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pb-1.5 pl-3 pr-1.5 pt-1">
          <span className="text-[11px] text-[var(--ed-text-tertiary)]">⌘ / Ctrl + ↵ 发送</span>
          <button
            type="button"
            aria-label="发送"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex size-7 cursor-pointer items-center justify-center rounded-[8px] border-none bg-[var(--ed-accent)] text-[var(--ed-text-inverse)] transition-colors hover:bg-[var(--ed-accent-hover)] disabled:cursor-default disabled:bg-[var(--ed-bg-press)] disabled:text-[var(--ed-text-tertiary)]"
          >
            <ArrowUp size={15} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CommentInput;
