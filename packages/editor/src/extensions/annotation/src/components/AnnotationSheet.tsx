import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { PenLine, Trash2 } from "lucide-react";
import { cn, lockBodyScroll, usePortalContainer } from "@tau/ui";
import { OverlayBackDismiss } from "@tau/editor/api";
import { AnnotationNumber, CopyButton } from "./parts.tsx";
import { dangerButtonClass, iconButtonClass } from "./classes.ts";

interface AnnotationSheetProps {
  mode: "view" | "edit";
  number: number;
  content: string;
  context: { before: string; after: string };
  readOnly: boolean;
  onModeChange: (mode: "view" | "edit") => void;
  onChange: (content: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

const SPRING = {
  type: "spring",
  damping: 28,
  stiffness: 320,
  mass: 0.9,
} as const;

/**
 * 触屏端注解抽屉：贴屏幕底，点遮罩或返回手势关闭。
 * 键盘避让读 --ed-overlay-bottom（默认只让出安全区），宿主按自己的键盘测量覆盖。
 */
export default function AnnotationSheet({
  mode,
  number,
  content,
  context,
  readOnly,
  onModeChange,
  onChange,
  onDelete,
  onClose,
}: AnnotationSheetProps) {
  const portalContainer = usePortalContainer();
  const reduceMotion = useReducedMotion();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [visible, setVisible] = useState(true);
  const editing = mode === "edit" && !readOnly;

  useEffect(() => lockBodyScroll(document), []);

  useEffect(() => {
    if (!editing) return;
    // 推迟一轮：插入入口收尾时会把焦点还给正文
    const timer = window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => window.clearTimeout(timer);
  }, [editing]);

  // 先播退场再通知关闭，父级卸载时抽屉已滑出
  const requestClose = () => setVisible(false);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] text-[var(--ed-text)]"
      role="dialog"
      aria-modal="true"
      aria-label={`注解 ${number}`}
    >
      <OverlayBackDismiss open={visible} onDismiss={requestClose} />
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[var(--ed-overlay)]"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.22 }}
        onClick={requestClose}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 rounded-t-[18px] bg-[var(--ed-bg-surface)] px-[18px] pt-4 shadow-[var(--ed-shadow-float)]"
        style={{
          paddingBottom: "calc(var(--ed-overlay-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
        }}
        initial={reduceMotion ? false : { y: "100%" }}
        animate={{ y: visible ? 0 : "100%" }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
        onAnimationComplete={() => {
          if (!visible) onClose();
        }}
      >
        <div className="flex items-center gap-2">
          <AnnotationNumber value={number} className="px-[7px] text-[12px] leading-5" />
          <b className="flex-1 text-[15px]">{editing ? "编辑注解" : "注解"}</b>
          {!editing && <CopyButton text={content} className="size-[34px] rounded-[10px]" />}
        </div>

        {editing ? (
          <>
            <textarea
              ref={textareaRef}
              aria-label={`注解 ${number}`}
              value={content}
              placeholder="写下注解…"
              rows={3}
              className="mt-3 block [field-sizing:content] max-h-[40dvh] min-h-[84px] w-full resize-none rounded-[12px] border border-solid border-[var(--ed-accent)] bg-[var(--ed-bg-surface)] px-3 py-2.5 text-[16px] leading-[1.7] text-[var(--ed-text)] shadow-[var(--ed-focus-ring)] outline-none placeholder:text-[var(--ed-text-tertiary)]"
              onChange={event => onChange(event.target.value)}
            />
            <div className="mt-2.5 flex items-center text-[12.5px] text-[var(--ed-text-tertiary)]">
              <span className="flex-1">自动保存</span>
              <button
                type="button"
                className="h-8 cursor-pointer rounded-[10px] border-none bg-[var(--ed-accent)] px-4 text-[14px] font-medium text-[var(--ed-text-inverse)]"
                onClick={requestClose}
              >
                完成
              </button>
            </div>
          </>
        ) : (
          <>
            {(context.before || context.after) && (
              <div className="mt-2.5 line-clamp-2 border-0 border-l-2 border-solid border-[var(--ed-border)] pl-2.5 text-[12.5px] leading-[1.6] text-[var(--ed-text-tertiary)]">
                {context.before}
                <span className="font-tau-mono px-0.5 text-[var(--ed-accent-text)]">
                  [{number}]
                </span>
                {context.after}
              </div>
            )}
            <div className="mt-3 max-h-[45dvh] overflow-y-auto text-[15.5px] leading-[1.75] break-words whitespace-pre-wrap">
              {content || <span className="text-[var(--ed-text-tertiary)]">空注解</span>}
            </div>
            {!readOnly && (
              <div className="mt-3.5 flex gap-2.5">
                <button
                  type="button"
                  aria-label="删除注解"
                  className={cn(
                    iconButtonClass,
                    dangerButtonClass,
                    "size-[42px] rounded-[12px] bg-[var(--ed-danger-soft)] text-[var(--ed-danger)]"
                  )}
                  onClick={onDelete}
                >
                  <Trash2 size={17} />
                </button>
                <button
                  type="button"
                  className="flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-none bg-[var(--ed-accent)] text-[14.5px] font-medium text-[var(--ed-text-inverse)]"
                  onClick={() => onModeChange("edit")}
                >
                  <PenLine size={15} />
                  编辑
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>,
    portalContainer
  );
}
