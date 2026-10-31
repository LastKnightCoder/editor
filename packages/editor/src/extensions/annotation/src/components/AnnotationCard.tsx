import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Popover, cn } from "@tau/ui";
import { OverlayBackDismiss } from "@tau/editor/api";
import { AnnotationNumber, CopyButton } from "./parts.tsx";
import { dangerButtonClass, iconButtonClass } from "./classes.ts";

interface AnnotationCardProps {
  anchor: HTMLElement;
  number: number;
  content: string;
  readOnly: boolean;
  onChange: (content: string) => void;
  onDelete: () => void;
  /** byKeyboard：Esc / ⌘↵ / 删除等键盘或按钮操作关闭，需要把光标还给正文 */
  onClose: (byKeyboard: boolean) => void;
}

/** 桌面端注解卡片：点击标记打开，编辑态输入即保存，只读时只看和复制 */
export default function AnnotationCard({
  anchor,
  number,
  content,
  readOnly,
  onChange,
  onDelete,
  onClose,
}: AnnotationCardProps) {
  const keyboardCloseRef = useRef(false);
  const caretPlacedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 从斜杠菜单插入时菜单会把焦点还给正文，推迟一轮再抢回来
  useEffect(() => {
    if (readOnly) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }));
    return () => window.clearTimeout(timer);
  }, [readOnly]);

  const close = (byKeyboard: boolean) => {
    keyboardCloseRef.current = false;
    onClose(byKeyboard);
  };

  return (
    <Popover
      anchor={anchor}
      open
      onOpenChange={next => {
        if (!next) close(keyboardCloseRef.current);
      }}
      placement="bottom"
      arrow={false}
      className="w-[300px] max-w-[calc(100vw-24px)] overflow-hidden text-[var(--ed-text)]"
    >
      <OverlayBackDismiss open onDismiss={() => close(true)} />
      <div
        onKeyDownCapture={event => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing)
            keyboardCloseRef.current = true;
        }}
      >
        <div className="flex h-9 items-center gap-1 pt-1 pr-2 pl-3.5">
          <span className="flex flex-1 items-center gap-1.5 text-[12px] text-[var(--ed-text-tertiary)]">
            <AnnotationNumber value={number} />
            注解
          </span>
          <CopyButton text={content} className="size-[26px]" />
          {!readOnly && (
            <button
              type="button"
              aria-label="删除注解"
              className={cn(iconButtonClass, dangerButtonClass, "size-[26px]")}
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        {readOnly ? (
          <div className="max-h-60 overflow-y-auto px-3.5 pt-1 pb-3 text-[14px] leading-[1.65] break-words whitespace-pre-wrap">
            {content || <span className="text-[var(--ed-text-tertiary)]">空注解</span>}
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              data-autofocus
              aria-label={`注解 ${number}`}
              value={content}
              placeholder="写下注解…"
              rows={3}
              className="block [field-sizing:content] max-h-60 min-h-[66px] w-full resize-none border-none bg-transparent px-3.5 pt-1 pb-2 text-[14px] leading-[1.65] text-[var(--ed-text)] outline-none placeholder:text-[var(--ed-text-tertiary)]"
              onChange={event => onChange(event.target.value)}
              onFocus={event => {
                // 首次聚焦把光标放到末尾，方便接着写
                if (caretPlacedRef.current) return;
                caretPlacedRef.current = true;
                const el = event.currentTarget;
                el.setSelectionRange(el.value.length, el.value.length);
              }}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  close(true);
                }
              }}
            />
            <div className="flex items-center gap-2 border-0 border-t border-solid border-[var(--ed-border)] px-3.5 py-2 text-[12px] text-[var(--ed-text-tertiary)]">
              <span className="flex-1">
                <kbd className="font-tau-mono rounded-[4px] border border-solid border-[var(--ed-border)] px-1 text-[11px]">
                  Esc
                </kbd>{" "}
                关闭
              </span>
              <span>自动保存</span>
            </div>
          </>
        )}
      </div>
    </Popover>
  );
}
