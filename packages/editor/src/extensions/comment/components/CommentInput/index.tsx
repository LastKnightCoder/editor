import React, { useEffect, useRef, useState } from "react";

interface CommentInputProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

const CommentInput: React.FC<CommentInputProps> = ({
  placeholder = "添加批注...",
  initialValue = "",
  onSubmit,
  onCancel,
  autoFocus = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    const content = value.trim();
    if (!content) return;
    onSubmit(content);
    setValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={event => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-[var(--ed-border)] bg-[var(--ed-bg-sunken)] px-4 py-3 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)]"
      />

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-[var(--ed-bg-sunken)] px-4 py-2 text-sm font-medium text-[var(--ed-text)] transition-all hover:bg-gray-200 dark:hover:bg-zinc-700"
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
        >
          提交
        </button>
      </div>
    </div>
  );
};

export default CommentInput;
