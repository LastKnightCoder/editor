import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, MoreHorizontal, Plus } from "lucide-react";

import { ToolbarIconButton } from "@tau/editor/api";
import { cn } from "@tau/ui";

import SelectLanguage from "../SelectLanguage";

/** 代码块悬停 group 名：容器加它，标题栏操作随悬停显隐（代码块不会嵌套代码块） */
export const CODE_HOVER_GROUP = "group/code";

/** 悬停或聚焦块时才显示；触屏没有悬停，常显 */
const REVEAL_ON_HOVER =
  "opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-focus-within/code:opacity-100 group-hover/code:opacity-100 [@media(hover:none)]:opacity-100";

export interface CodeBlockStepNav {
  /** 0 起 */
  current: number;
  total: number;
  title?: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** 只读时不提供 */
  onInsertNext?: () => void;
  onTitleChange?: (title: string) => void;
}

interface InlineInputProps {
  initialValue: string;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
  onCommit: (value: string) => void;
}

/** 失焦或回车提交的行内输入；提交前只改本地值，避免每个字都写一次节点 */
const InlineInput = ({
  initialValue,
  placeholder,
  autoFocus,
  className,
  onCommit,
}: InlineInputProps) => {
  const [value, setValue] = useState(initialValue);
  const committedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.select();
  }, [autoFocus]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  };

  return (
    <input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      spellCheck={false}
      className={cn(
        "min-w-0 rounded-[0.3125em] border-none bg-transparent px-[0.375em] py-[0.125em] outline-none transition-colors duration-150 placeholder:text-[var(--ed-text-tertiary)] placeholder:opacity-80 hover:bg-[var(--ed-bg-hover)] focus:bg-[var(--ed-bg-surface)] focus:text-[var(--ed-text)] focus:shadow-[0_0_0_1px_var(--ed-border),var(--ed-focus-ring)]",
        className
      )}
      onChange={event => {
        committedRef.current = false;
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
};

const StepNavigator = ({ steps, readOnly }: { steps: CodeBlockStepNav; readOnly: boolean }) => (
  <>
    <span className="ml-[0.125em] inline-flex h-[1.75em] shrink-0 items-center gap-px rounded-[0.5em] px-[1px] text-[1em] shadow-[inset_0_0_0_1px_var(--ed-border)]">
      <ToolbarIconButton
        icon={ChevronLeft}
        title="上一步"
        disabled={!steps.hasPrevious}
        onClick={steps.onPrevious}
        className="h-[1.375em] w-[1.375em]"
      />
      <span
        className="min-w-[2.6em] select-none text-center font-[family-name:var(--ed-font-mono)] text-[0.72em] font-medium leading-none text-[var(--ed-text-secondary)]"
        aria-label="步骤进度"
      >
        {`${steps.current + 1}/${steps.total}`}
      </span>
      <ToolbarIconButton
        icon={ChevronRight}
        title="下一步"
        disabled={!steps.hasNext}
        onClick={steps.onNext}
        className="h-[1.375em] w-[1.375em]"
      />
      {steps.onInsertNext && (
        <ToolbarIconButton
          icon={Plus}
          title="在后面插入一步"
          onClick={steps.onInsertNext}
          active
          className="h-[1.375em] w-[1.375em]"
        />
      )}
    </span>
    {!readOnly && steps.onTitleChange ? (
      <InlineInput
        key={steps.current}
        initialValue={steps.title ?? ""}
        placeholder="写一句这一步做了什么…"
        className="flex-1 text-[0.78em] text-[var(--ed-text-tertiary)]"
        onCommit={value => steps.onTitleChange?.(value.trim())}
      />
    ) : (
      <span
        className="min-w-0 flex-1 truncate px-[0.375em] text-[0.78em] text-[var(--ed-text-tertiary)]"
        title={steps.title}
      >
        {steps.title}
      </span>
    )}
  </>
);

const MoreButton = ({ onOpenMenu }: { onOpenMenu: (anchor: DOMRect) => void }) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  return (
    <span ref={anchorRef} className={cn("inline-flex", REVEAL_ON_HOVER)}>
      <ToolbarIconButton
        icon={MoreHorizontal}
        title="更多"
        onClick={() => {
          const anchor = anchorRef.current?.getBoundingClientRect();
          if (anchor) onOpenMenu(anchor);
        }}
      />
    </span>
  );
};

interface CodeBlockHeaderProps {
  language: string;
  onLanguageChange: (language: string) => void;
  readOnly: boolean;
  filename?: string;
  editingFilename: boolean;
  onEditFilename: () => void;
  /** 空串表示清除文件名 */
  onFilenameCommit: (filename: string) => void;
  steps: CodeBlockStepNav | null;
  copied: boolean;
  onCopy: () => void;
  onOpenMenu?: (anchor: DOMRect) => void;
}

const CodeBlockHeader = ({
  language,
  onLanguageChange,
  readOnly,
  filename,
  editingFilename,
  onEditFilename,
  onFilenameCommit,
  steps,
  copied,
  onCopy,
  onOpenMenu,
}: CodeBlockHeaderProps) => (
  <div
    className="flex h-[2.25em] items-center gap-[0.25em] border-b border-solid border-[var(--ed-border)] px-[0.375em] text-[var(--ed-text-secondary)]"
    onClick={event => event.stopPropagation()}
  >
    <SelectLanguage readonly={readOnly} value={language} onChange={onLanguageChange} />
    {editingFilename && !readOnly ? (
      <InlineInput
        initialValue={filename ?? ""}
        placeholder="文件名，如 src/index.ts"
        autoFocus
        className="w-[16em] font-[family-name:var(--ed-font-mono)] text-[0.75em] text-[var(--ed-text-secondary)]"
        onCommit={onFilenameCommit}
      />
    ) : (
      filename && (
        <span
          className={cn(
            "min-w-0 shrink truncate rounded-[0.3125em] px-[0.375em] py-[0.125em] font-[family-name:var(--ed-font-mono)] text-[0.75em] text-[var(--ed-text-tertiary)]",
            !readOnly && "cursor-text transition-colors duration-150 hover:bg-[var(--ed-bg-hover)]"
          )}
          title={filename}
          onClick={readOnly ? undefined : onEditFilename}
        >
          {filename}
        </span>
      )
    )}
    {steps ? <StepNavigator steps={steps} readOnly={readOnly} /> : <span className="flex-1" />}
    <button
      type="button"
      title="复制代码"
      className={cn(
        "inline-flex h-[1.75em] shrink-0 cursor-pointer items-center gap-[0.3em] rounded-[0.375em] border-none bg-transparent px-[0.5em] text-[0.75em] text-[var(--ed-text-tertiary)] transition-colors duration-150 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]",
        copied ? "text-[var(--ed-ok)] opacity-100 hover:text-[var(--ed-ok)]" : REVEAL_ON_HOVER
      )}
      onClick={onCopy}
    >
      {copied ? (
        <Check size="1.15em" strokeWidth={2.2} />
      ) : (
        <Copy size="1.15em" strokeWidth={1.9} />
      )}
      {copied ? "已复制" : "复制"}
    </button>
    {onOpenMenu && <MoreButton onOpenMenu={onOpenMenu} />}
  </div>
);

export default CodeBlockHeader;
