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
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="
          w-full px-4 py-3
          rounded-xl text-sm
          outline-none transition-all
          bg-gray-50 dark:bg-slate-950
          border border-gray-200 dark:border-slate-700
          text-gray-800 dark:text-white
          placeholder:text-gray-400 dark:placeholder:text-slate-500
          focus:border-indigo-500
          focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]
          dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)]
          resize-none
        "
      />

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="
              px-4 py-2 rounded-lg
              text-sm font-medium
              transition-all
              bg-gray-100 dark:bg-slate-800
              text-gray-700 dark:text-slate-300
              hover:bg-gray-200 dark:hover:bg-slate-700
            "
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="
            px-4 py-2 rounded-lg
            text-sm font-semibold
            transition-colors
            bg-indigo-500 text-white
            hover:bg-indigo-600
            disabled:bg-gray-200 dark:disabled:bg-slate-800
            disabled:text-gray-400 dark:disabled:text-slate-500
            disabled:cursor-not-allowed
          "
        >
          提交
        </button>
      </div>
    </div>
  );
};

export default CommentInput;
