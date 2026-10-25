import React, { PropsWithChildren, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, Path, Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useFocused,
  useReadOnly,
  useSelected,
  useSlateStatic,
} from "slate-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { cn, mergeRefs } from "@tau/ui";
import { InlineChromiumBugfix, OverlayBackDismiss } from "@tau/editor/api";
import { useTextFieldBinding, canEditElement } from "@tau/editor/api";
import { IEditorTextFields } from "@tau/editor/api";
import { bindTextFieldTextarea } from "@tau/editor-source-view";
import isHotkey from "is-hotkey";
import Katex from "../../renderers/Katex";
import type { InlineMathElement } from "../../types";

interface InlineMathProps {
  attributes: RenderElementProps["attributes"];
  element: InlineMathElement;
}

const InlineMath: React.FC<PropsWithChildren<InlineMathProps>> = props => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const bound = Boolean(editor.tryGetService(IEditorTextFields));
  const source = useTextFieldBinding(bound ? element : undefined, "tex");
  const readOnly = useReadOnly() || !canEditElement(editor, element) || (bound && source.readOnly);
  const selected = useSelected();
  const focused = useFocused();
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(element.tex);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const tex = bound ? (isOpen ? draft : source.value) : element.tex;
  const elementRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!isOpen || !source.binding || !inputRef.current) return;
    setBindingError(null);
    const binding = bindTextFieldTextarea(
      inputRef.current,
      source.binding,
      setDraft,
      setBindingError
    );
    return () => binding.dispose();
  }, [isOpen, source.binding]);

  const handleTexChange = useMemoizedFn((newTex: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { tex: newTex }, { at: path });
  });

  const focusInlineElement = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.select(editor, path);
    ReactEditor.focus(editor);
  });

  const openInline = useMemoizedFn(() => {
    if (readOnly) return;
    focusInlineElement();
    setIsOpen(true);
  });

  const moveCaretOut = useMemoizedFn((direction: "left" | "right") => {
    const path = ReactEditor.findPath(editor, element);
    const targetPoint =
      direction === "left"
        ? Editor.before(editor, path, { voids: true })
        : Editor.after(editor, path, { voids: true });
    Transforms.select(editor, targetPoint || path);
    ReactEditor.focus(editor);
  });

  const closeInline = useMemoizedFn((direction?: "left" | "right") => {
    inputRef.current?.blur();
    if (direction) moveCaretOut(direction);
    setIsOpen(false);
  });

  useEffect(() => {
    if (readOnly) setIsOpen(false);
  }, [readOnly]);

  useEffect(() => {
    const handleFocus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      let matched = detail === element || detail?.element === element;
      if (!matched && Array.isArray(detail?.path)) {
        try {
          matched = Path.equals(ReactEditor.findPath(editor, element), detail.path);
        } catch {
          matched = false;
        }
      }
      if (matched) openInline();
    };
    document.addEventListener("preview-editor-focus", handleFocus);
    return () => document.removeEventListener("preview-editor-focus", handleFocus);
  }, [editor, element, openInline]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!elementRef.current?.contains(event.target as Node)) closeInline();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, closeInline]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    const anchor = elementRef.current;
    if (!isOpen || !preview || !anchor) return;
    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const padding = 8;
      const gap = 6;
      const viewportWidth = document.documentElement.clientWidth;
      const halfWidth = previewRect.width / 2;
      const x = Math.min(
        Math.max(anchorRect.left + anchorRect.width / 2, padding + halfWidth),
        viewportWidth - padding - halfWidth
      );
      let y = anchorRect.bottom + gap;
      if (y + previewRect.height > window.innerHeight - padding) {
        y = Math.max(padding, anchorRect.top - previewRect.height - gap);
      }
      preview.style.left = `${x}px`;
      preview.style.top = `${y}px`;
      preview.style.visibility = "visible";
    };
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    observer?.observe(anchor);
    observer?.observe(preview);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, tex]);

  useEffect(() => {
    if (readOnly || !selected || !focused || isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        moveCaretOut(event.key === "ArrowLeft" ? "left" : "right");
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        openInline();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [readOnly, selected, focused, isOpen, moveCaretOut, openInline]);

  const showActiveStyle = !readOnly && (isOpen || (selected && focused));

  return (
    <span
      {...attributes}
      ref={mergeRefs(attributes.ref, elementRef)}
      className={cn(
        "relative inline-flex cursor-text items-center rounded-[4px] px-[0.125em] transition-colors duration-150",
        "[&_.katex-display>.katex]:m-0 [&_.katex-display>.katex]:w-auto [&_.katex-display]:overflow-visible [&_.katex-display]:p-0",
        showActiveStyle && "bg-[var(--ed-accent-soft)]",
        showActiveStyle && !isOpen && "shadow-[0_0_0_1px_var(--ed-accent)]"
      )}
      onClick={event => {
        event.stopPropagation();
        if (!isOpen) openInline();
      }}
    >
      <span contentEditable={false} className="relative inline-flex items-baseline">
        {isOpen ? (
          <span className="font-tau-mono inline-flex items-baseline text-[0.85em] text-[var(--ed-accent-text)]">
            <span className="select-none">$</span>
            <input
              ref={inputRef}
              data-inline-math-input=""
              aria-label="行内公式 LaTeX 源码"
              value={bound ? undefined : tex}
              readOnly={readOnly || Boolean(bindingError)}
              size={Math.max(1, tex.length + 1)}
              placeholder="输入公式"
              spellCheck={false}
              className="ease-tau-out [field-sizing:content] max-w-[min(55vw,20rem)] min-w-3 border-none bg-transparent p-0 text-inherit transition-[width] duration-120 outline-none placeholder:text-[var(--ed-text-tertiary)]"
              onChange={bound ? undefined : event => handleTexChange(event.target.value)}
              onClick={event => event.stopPropagation()}
              onKeyDown={event => {
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;
                if (bound && isHotkey(["mod+z", "mod+shift+z", "mod+y"], event.nativeEvent)) {
                  event.preventDefault();
                  if (!readOnly && !bindingError) {
                    if (isHotkey(["mod+shift+z", "mod+y"], event.nativeEvent))
                      source.binding?.redo();
                    else source.binding?.undo();
                  }
                  return;
                }
                const input = event.currentTarget;
                if (event.key === "Escape" || event.key === "Enter") {
                  event.preventDefault();
                  closeInline("right");
                } else if (
                  event.key === "ArrowLeft" &&
                  input.selectionStart === 0 &&
                  input.selectionEnd === 0
                ) {
                  event.preventDefault();
                  closeInline("left");
                } else if (
                  event.key === "ArrowRight" &&
                  input.selectionStart === input.value.length &&
                  input.selectionEnd === input.value.length
                ) {
                  event.preventDefault();
                  closeInline("right");
                }
              }}
            />
            <span className="select-none">$</span>
          </span>
        ) : tex ? (
          <Katex tex={tex} inline />
        ) : (
          <span className="px-1 text-[var(--ed-text-tertiary)]">Empty Math</span>
        )}
        {isOpen &&
          createPortal(
            <motion.span
              ref={previewRef}
              aria-label="公式预览"
              contentEditable={false}
              className="rounded-tau-sm shadow-card pointer-events-none fixed top-0 left-0 z-9999 inline-flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center overflow-x-auto bg-[var(--ed-bg-surface)] px-[0.6em] py-[0.4em] whitespace-nowrap text-[var(--ed-text)]"
              style={{ visibility: "hidden" }}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              {tex ? (
                <Katex tex={tex} inline />
              ) : (
                <span className="text-[var(--ed-text-tertiary)]">公式预览</span>
              )}
            </motion.span>,
            document.body
          )}
      </span>
      {(source.error || bindingError) && (
        <span role="alert" contentEditable={false}>
          {source.error || bindingError}
        </span>
      )}
      <OverlayBackDismiss open={isOpen && !readOnly} onDismiss={() => closeInline("right")} />
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  );
};

export default InlineMath;
