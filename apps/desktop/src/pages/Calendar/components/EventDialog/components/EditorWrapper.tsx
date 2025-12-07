import { FC, useState } from "react";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";

interface EditorWrapperProps {
  value: Descendant[];
  onChange: (value: Descendant[]) => void;
  editorRef: React.RefObject<EditorRef>;
  readonly?: boolean;
}

const EditorWrapper: FC<EditorWrapperProps> = ({
  value,
  onChange,
  editorRef,
  readonly = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        描述（可选）
      </label>
      <div
        className={`rounded-xl p-5 min-h-[120px] transition-all bg-gray-50 dark:bg-slate-950 ${
          isFocused
            ? "border-2 border-indigo-500 dark:border-indigo-400"
            : "border border-gray-200 dark:border-slate-700"
        }`}
      >
        <Editor
          ref={editorRef}
          initValue={value}
          onChange={onChange}
          readonly={readonly}
          placeHolder="添加事件描述..."
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </div>
    </div>
  );
};

export default EditorWrapper;
