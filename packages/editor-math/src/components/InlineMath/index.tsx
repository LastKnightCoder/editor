import React, { PropsWithChildren, useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Transforms, Editor } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlateStatic,
  useReadOnly,
  useSelected,
  useFocused,
} from "slate-react";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { Type, X } from "lucide-react";
import { cn } from "@tau/ui";
import { Katex } from "@tau/shared";

import type { InlineMathElement } from "../../types";
import type { FormattedText as CustomText } from "@tau/markdown/model";
import { InlineChromiumBugfix } from "@tau/editor/api";

interface InlineMathProps {
  attributes: RenderElementProps["attributes"];
  element: InlineMathElement;
}

const IconButton = ({
  onClick,
  icon: Icon,
  active = false,
  danger = false,
  tooltip,
}: {
  onClick: (e: React.MouseEvent) => void;
  icon: any;
  active?: boolean;
  danger?: boolean;
  tooltip?: string;
}) => (
  <button
    onClick={onClick}
    title={tooltip}
    className={cn(
      "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200",
      "text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200",
      "hover:bg-black/5 dark:hover:bg-white/10",
      {
        "bg-blue-50 text-blue-500 hover:text-blue-600 dark:bg-blue-500/20 dark:text-blue-400":
          active && !danger,
        "text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/20":
          danger,
      }
    )}
  >
    <Icon size={15} strokeWidth={1.5} />
  </button>
);

const MathPopover = ({
  visible,
  elementRef,
  tex,
  onTexChange,
  onUnwrap,
  onClose,
}: {
  visible: boolean;
  elementRef: React.RefObject<HTMLElement | null>;
  tex: string;
  onTexChange: (val: string) => void;
  onUnwrap: (text: string) => void;
  onClose: (reason?: "escape" | "outside" | "button") => void;
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFocusedRef = useRef(false);
  const prevVisibleRef = useRef(visible);

  // 只在弹窗首次打开时，将输入框的值设置为当前的 tex
  useEffect(() => {
    if (visible && !prevVisibleRef.current && inputRef.current) {
      inputRef.current.value = tex;
    }
    prevVisibleRef.current = visible;
  }, [visible, tex]);

  useLayoutEffect(() => {
    if (!visible || !elementRef.current) return;

    const updatePosition = () => {
      const rect = elementRef.current!.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect() || {
        width: 320,
        height: 44,
      };

      const gap = 8;
      let x = rect.left + rect.width / 2 - popoverRect.width / 2;
      let y = rect.bottom + gap;

      if (x < gap) x = gap;
      if (x + popoverRect.width > window.innerWidth - gap) {
        x = window.innerWidth - popoverRect.width - gap;
      }

      if (y + popoverRect.height > window.innerHeight - gap) {
        y = rect.top - popoverRect.height - gap;
      }

      setPosition({ x, y });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, elementRef]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose("escape");
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        elementRef.current &&
        !elementRef.current.contains(e.target as Node)
      ) {
        onClose("outside");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose, elementRef]);

  useEffect(() => {
    if (!visible) {
      hasFocusedRef.current = false;
      return;
    }

    if (hasFocusedRef.current) return;

    hasFocusedRef.current = true;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={popoverRef}
          className="z-9999 fixed flex flex-col"
          style={{ left: position.x, top: position.y }}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            duration: 0.1,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className={cn(
              "min-w-75 flex max-w-[400px] items-center gap-3 p-1.5",
              "bg-white/80 saturate-150 backdrop-blur-xl dark:bg-zinc-900/80",
              "border border-black/5 dark:border-white/10",
              "shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]",
              "rounded-lg"
            )}
          >
            <div className="flex flex-1 items-center gap-3 pl-1.5">
              <span className="select-none font-mono text-xs font-bold text-slate-400">TeX</span>
              <input
                ref={inputRef}
                className="min-w-0 flex-1 border-none bg-transparent font-mono text-sm text-[var(--ed-text)] outline-none placeholder:text-slate-400"
                defaultValue={tex}
                onChange={e => onTexChange(e.target.value)}
                placeholder="输入 LaTeX 公式..."
              />
            </div>

            <div className="ml-1 flex items-center gap-1 border-l border-black/5 pl-1 dark:border-white/5">
              <IconButton
                icon={Type}
                onClick={() => onUnwrap(inputRef.current?.value || "")}
                tooltip="还原为文本"
              />
              <IconButton icon={X} onClick={() => onClose("button")} tooltip="关闭" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

const InlineMath: React.FC<PropsWithChildren<InlineMathProps>> = props => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();

  const [isOpen, setIsOpen] = useState(false);
  const elementRef = useRef<HTMLElement>(null);

  const handleTexChange = useMemoizedFn((newTex: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { tex: newTex }, { at: path });
  });

  const focusInlineElement = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.select(editor, path);
    ReactEditor.focus(editor);
  });

  const moveCaretOut = useMemoizedFn((direction: "left" | "right") => {
    const path = ReactEditor.findPath(editor, element);
    const targetPoint =
      direction === "left"
        ? Editor.before(editor, path, { voids: true })
        : Editor.after(editor, path, { voids: true });
    if (targetPoint) {
      Transforms.select(editor, targetPoint);
      ReactEditor.focus(editor);
    }
  });

  const moveCaretToInlineEnd = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    const targetPoint =
      Editor.after(editor, path, { voids: true }) || Editor.before(editor, path, { voids: true });

    if (targetPoint) {
      Transforms.select(editor, targetPoint);
      return;
    }
    Transforms.select(editor, path);
  });

  const focusEditorWithDelay = useMemoizedFn(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        ReactEditor.focus(editor);
      }, 0);
    });
  });

  const handleUnwrap = useMemoizedFn((text: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.removeNodes(editor, { at: path });
    const textNode: CustomText = { text, type: "formatted" };
    Transforms.insertNodes(editor, textNode, { at: path });
    setIsOpen(false);
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!readOnly) {
      focusInlineElement();
      setIsOpen(true);
    }
  };

  const handleClose = useMemoizedFn((reason?: "escape" | "outside" | "button") => {
    setIsOpen(false);
    if (reason === "outside") return;
    requestAnimationFrame(() => {
      moveCaretToInlineEnd();
      focusEditorWithDelay();
    });
  });

  useEffect(() => {
    if (readOnly || !selected || !focused) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (!isOpen && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        event.stopPropagation();
        moveCaretOut(event.key === "ArrowLeft" ? "left" : "right");
        return;
      }

      if (!isOpen && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(true);
        return;
      }

      if (isOpen && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose("escape");
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [readOnly, selected, focused, isOpen, moveCaretOut, handleClose]);

  const showActiveStyle = !readOnly && (isOpen || (selected && focused));
  const showIndicator = !readOnly && selected && focused && !isOpen;

  return (
    <>
      <span
        {...attributes}
        ref={elementRef}
        className={cn(
          "relative inline-flex cursor-pointer items-center rounded-[4px] px-[0.125em] transition-[background-color,box-shadow] duration-150 ease-[ease]",
          // 行内公式不套用块级 .katex-display 的横向滚动，恢复自然溢出
          "[&_.katex-display>.katex]:m-0 [&_.katex-display>.katex]:w-auto [&_.katex-display]:overflow-visible [&_.katex-display]:p-0",
          showActiveStyle &&
            !isOpen &&
            "bg-[var(--ed-accent-soft)] shadow-[0_0_0_1px_var(--ed-accent)]",
          isOpen &&
            "bg-[var(--ed-accent-soft)] shadow-[0_0_0_1px_var(--ed-accent),var(--ed-shadow-card)]"
        )}
        onClick={handleClick}
      >
        {showIndicator && (
          <span
            className="pointer-events-none absolute left-1/2 top-[-1.1em] -translate-x-1/2 -translate-y-[60%] whitespace-nowrap rounded-full border border-solid border-[var(--ed-accent)] bg-[var(--ed-accent-soft)] px-[6px] py-[2px] text-[0.65rem] font-semibold leading-none tracking-[0.05em] text-[var(--ed-accent-text)]"
            aria-hidden="true"
          >
            TeX
          </span>
        )}
        {tex ? <Katex tex={tex} /> : <span className="px-1 text-slate-400">Empty Math</span>}
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>

      <MathPopover
        visible={isOpen && !readOnly}
        elementRef={elementRef}
        tex={tex}
        onTexChange={handleTexChange}
        onUnwrap={handleUnwrap}
        onClose={handleClose}
      />
    </>
  );
};

export default InlineMath;
