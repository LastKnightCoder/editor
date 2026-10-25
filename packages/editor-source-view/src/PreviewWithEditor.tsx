import { useTouchInteraction } from "@tau/editor/api";
import { TouchPreviewWithEditor } from "./TouchPreviewWithEditor";
import React, {
  PropsWithChildren,
  useRef,
  useState,
  memo,
  useEffect,
  useLayoutEffect,
} from "react";
import { cn } from "@tau/ui";
import { useClickAway, useDebounceFn, useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSelected, useSlateStatic } from "slate-react";
import { ErrorBoundary } from "@tau/shared";
import { Transforms, Path, Element, Node } from "slate";
import { Check, Copy, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { If } from "@tau/shared";
import { AddParagraph, useEditorTheme, type AddParagraphRef } from "@tau/editor/api";
import { previewActionsMap } from "./menu";
import { PreviewErrorContext, type PreviewError } from "./previewError";
import { EmptySourcePlaceholder, ErrorBar, KindLabel } from "./parts";
import { FloatingToolbar, ToolbarDivider, ToolbarIconButton } from "@tau/editor/api";

import type { CustomElement } from "@tau/editor/api";
import "./PreviewWithEditor.vendor.css";
import { useIsLastElement } from "@tau/editor/api";
import { canEditElement } from "@tau/editor/api";
import type { EditorTextField } from "@tau/editor/api";
import { focusPreviousBlock, focusNextBlock } from "@tau/editor/api";
import { useSourceFocusRequests } from "./focusRequests";
import ShikiOverlayEditor, {
  type OverlayEditorController,
  type OverlayKeydownHelpers,
} from "./overlay/ShikiOverlayEditor";
import { handleSourceKeyDown } from "./overlay/sourceKeys";
import { shikiLanguageForMode } from "./sourceLanguage";

export interface IPreviewWithEditorProps {
  mode: string;
  /** 块类型名，显示在编辑标题行与空块占位 */
  title: string;
  icon: LucideIcon;
  initValue: string;
  onChange?: (value: string) => void;
  textBinding?: EditorTextField;
  element: CustomElement;
  center?: boolean;
  extend?: boolean;
  inPlace?: boolean;
  delimiters?: string;
  immediate?: boolean;
}

const PointerPreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = memo(
  props => {
    const {
      mode,
      title,
      icon,
      initValue,
      onChange,
      children,
      element,
      center,
      extend,
      inPlace,
      delimiters,
      immediate,
      textBinding,
    } = props;
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(initValue);
    const [copied, setCopied] = useState(false);
    const [inlineError, setInlineError] = useState<PreviewError | null>(null);
    const editorRef = useRef<OverlayEditorController | null>(null);
    const pendingLocalValueRef = useRef<string | null>(null);
    const pendingFocusRef = useRef<"start" | "end" | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const addParagraphRef = useRef<AddParagraphRef>(null);
    const slateEditor = useSlateStatic();
    const { isDark } = useEditorTheme();
    const editorReadOnly = useReadOnly();
    const selected = useSelected();
    const readOnly =
      editorReadOnly || (!onChange && !textBinding) || !canEditElement(slateEditor, element);
    const isLast = useIsLastElement(element);
    const isEmpty = !(immediate ? value : initValue)?.trim();
    const previousHeightRef = useRef<number | null>(null);

    useLayoutEffect(() => {
      const container = ref.current;
      if (!container) return;
      const previousHeight = previousHeightRef.current;
      const nextHeight = container.offsetHeight;
      previousHeightRef.current = nextHeight;
      if (
        !inPlace ||
        previousHeight === null ||
        Math.abs(previousHeight - nextHeight) < 1 ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        typeof container.animate !== "function"
      ) {
        return;
      }
      const animation = container.animate(
        [
          { height: `${previousHeight}px`, opacity: 0.76 },
          { height: `${nextHeight}px`, opacity: 1 },
        ],
        { duration: 170, easing: "cubic-bezier(.22,1,.36,1)" }
      );
      return () => animation.cancel();
    });

    const {
      run: emitChange,
      flush: flushChange,
      cancel: cancelChange,
    } = useDebounceFn((code: string) => onChange?.(code), { wait: 500 });

    const focusSource = useMemoizedFn(() => {
      requestAnimationFrame(() => editorRef.current?.focus());
    });

    const startEditing = useMemoizedFn(() => {
      if (readOnly) return;
      setEditing(true);
      focusSource();
    });

    useEffect(() => {
      if (!inPlace || !selected || editing || readOnly) return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.defaultPrevented ||
          event.isComposing ||
          !ReactEditor.isFocused(slateEditor) ||
          (event.key !== " " && event.key !== "Enter")
        ) {
          return;
        }
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, button, [contenteditable="true"]')
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startEditing();
      };
      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [inPlace, selected, editing, readOnly, slateEditor, startEditing]);

    const finishEditing = useMemoizedFn(() => {
      flushChange();
      pendingFocusRef.current = null;
      setValue(editorRef.current?.getValue() ?? pendingLocalValueRef.current ?? value);
      setEditing(false);
    });

    useClickAway(() => {
      if (editing) finishEditing();
    }, ref);

    useEffect(() => {
      if (!copied) return;
      const timer = window.setTimeout(() => setCopied(false), 1600);
      return () => window.clearTimeout(timer);
    }, [copied]);

    useEffect(() => {
      const nextValue = initValue || "";
      if (textBinding) {
        cancelChange();
        setValue(nextValue);
        return;
      }
      if (pendingLocalValueRef.current === nextValue) {
        pendingLocalValueRef.current = null;
        return;
      }
      pendingLocalValueRef.current = null;
      cancelChange();
      setValue(nextValue);
    }, [initValue, cancelChange, textBinding]);

    const focusPreviewEditor = useMemoizedFn((position: "start" | "end") => {
      if (readOnly) return false;
      pendingFocusRef.current = position;
      try {
        ReactEditor.toDOMNode(slateEditor, element).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } catch {
        // 节点卸载时不再滚动。
      }
      setEditing(true);
      const controller = editorRef.current;
      if (!controller) return true;
      const line = position === "end" ? controller.lastLine() : 0;
      controller.setCursor({ line, ch: position === "end" ? controller.getLine(line).length : 0 });
      pendingFocusRef.current = null;
      return true;
    });

    useSourceFocusRequests(element, focusPreviewEditor);

    const deleteElement = useMemoizedFn(() => {
      cancelChange();
      const path = ReactEditor.findPath(slateEditor, element);
      const paragraphStart = {
        path: [...path, 0],
        offset: 0,
      };
      setEditing(false);
      Transforms.delete(slateEditor, {
        at: path,
      });
      Transforms.insertNodes(
        slateEditor,
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
        {
          at: path,
        }
      );
      Transforms.select(slateEditor, {
        anchor: paragraphStart,
        focus: paragraphStart,
      });
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
          try {
            ReactEditor.focus(slateEditor);
          } catch {
            // ignore
          }
        });
        return;
      }
      setTimeout(() => {
        try {
          ReactEditor.focus(slateEditor);
        } catch {
          // ignore
        }
      }, 0);
    });

    /** 方向键离开首末位置：移到前后可编辑块；向下没有可去的块时补一个段落 */
    const leaveSource = useMemoizedFn((direction: "backward" | "forward") => {
      const path = ReactEditor.findPath(slateEditor, element);
      const meta = { reason: "arrow", direction } as const;
      const focused =
        direction === "backward"
          ? focusPreviousBlock(slateEditor, path, meta)
          : focusNextBlock(slateEditor, path, meta);
      if (focused) {
        finishEditing();
        return true;
      }
      if (direction === "backward") return false;
      try {
        const nextElement = Node.get(slateEditor, Path.next(path));
        if (nextElement && Element.isElement(nextElement)) {
          document.dispatchEvent(
            new CustomEvent("element-focus-start", {
              detail: { focusElement: nextElement, start: true },
            })
          );
        } else {
          addParagraphRef.current?.addParagraph();
        }
      } catch {
        addParagraphRef.current?.addParagraph();
      }
      finishEditing();
      return true;
    });

    const onSourceKeyDown = useMemoizedFn(
      (event: React.KeyboardEvent<HTMLTextAreaElement>, helpers: OverlayKeydownHelpers) => {
        handleSourceKeyDown(event, helpers, {
          readOnly,
          applyChange: helpers.setValue,
          history: textBinding ?? null,
          deleteEmpty: deleteElement,
          focusOuter: leaveSource,
        });
      }
    );

    const onAddParagraph = useMemoizedFn(() => {
      finishEditing();
    });

    const handleInputChange = useMemoizedFn((code: string) => {
      setValue(code);
      if (textBinding) return;
      pendingLocalValueRef.current = code;
      if (immediate) {
        onChange?.(code);
        return;
      }
      emitChange(code);
    });

    const onEditorMount = useMemoizedFn((controller: OverlayEditorController) => {
      editorRef.current = controller;
      const position = pendingFocusRef.current;
      if (position) focusPreviewEditor(position);
      else controller.focus();
    });
    const onEditorUnmount = useMemoizedFn(() => {
      editorRef.current = null;
    });

    const copySource = useMemoizedFn(() => {
      void navigator.clipboard.writeText(initValue || "").then(() => setCopied(true));
    });

    // 预览菜单复用同一个编辑入口。
    useEffect(() => {
      previewActionsMap.set(element, { title, icon, edit: startEditing, copySource, readOnly });
      return () => {
        previewActionsMap.delete(element);
      };
    }, [element, title, icon, startEditing, copySource, readOnly]);

    const preview = (
      <PreviewErrorContext.Provider value={setInlineError}>
        <div
          className={cn(
            // 内容矮于最小高度时垂直居中，单行公式上下留白一致；3em 恰好容纳居中的悬浮操作条
            "box-border min-h-[3em] whitespace-normal transition-opacity duration-150",
            extend && "py-[0.3125em]",
            center ? "flex items-center justify-center" : "flex flex-col justify-center",
            inlineError?.stale && "opacity-40",
            inPlace && "cursor-text"
          )}
          onClick={inPlace ? startEditing : undefined}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </PreviewErrorContext.Provider>
    );

    const toolbar = (
      <FloatingToolbar className="group-hover/preview:pointer-events-auto group-hover/preview:translate-y-0 group-hover/preview:opacity-100">
        {readOnly ? (
          <ToolbarIconButton
            icon={copied ? Check : Copy}
            title={copied ? "已复制" : "复制源码"}
            tone={copied ? "ok" : "default"}
            onClick={copySource}
          />
        ) : (
          <ToolbarIconButton icon={Pencil} title="编辑" onClick={startEditing} />
        )}
        <If condition={!readOnly}>
          <ToolbarDivider />
          <ToolbarIconButton icon={Trash2} title="删除" tone="danger" onClick={deleteElement} />
        </If>
      </FloatingToolbar>
    );

    return (
      <div className="relative">
        <div
          contentEditable={false}
          ref={ref}
          className={cn(
            "group/preview relative rounded-[0.625em] border border-transparent transition-colors duration-150",
            editing && !inPlace && "overflow-hidden border-[var(--ed-border)]"
          )}
        >
          <If condition={editing && !inPlace}>
            <div className="flex h-[2.25em] items-center gap-[0.25em] bg-[var(--ed-code-bg)] pr-[0.375em] pl-[1em]">
              <span className="mr-auto">
                <KindLabel icon={icon} title={title} />
              </span>
              <button
                type="button"
                className="inline-flex h-[1.75em] items-center gap-[0.3em] rounded-[0.375em] px-[0.6em] text-[0.8em] font-medium text-[var(--ed-accent-text)] transition-colors duration-150 hover:bg-[var(--ed-accent-soft)]"
                onClick={finishEditing}
              >
                <Check size="1.1em" strokeWidth={2} />
                完成
              </button>
            </div>
          </If>
          {editing && (
            <div
              className={cn(
                "max-h-[50vh] overflow-y-auto",
                inPlace && "max-h-none overflow-visible",
                delimiters && "flex items-start gap-[0.5em] py-[0.25em]"
              )}
            >
              {delimiters && (
                <span className="font-tau-mono text-[0.85em] leading-[1.85] text-[var(--ed-text-tertiary)] select-none">
                  {delimiters}
                </span>
              )}
              <div
                className={cn(
                  "ed-preview-source",
                  inPlace && "ed-preview-source--in-place",
                  delimiters && "min-w-0 flex-1"
                )}
              >
                <ShikiOverlayEditor
                  className="ed-code-overlay"
                  value={value || ""}
                  textBinding={textBinding}
                  language={shikiLanguageForMode(mode)}
                  isDark={isDark}
                  readOnly={readOnly}
                  wrap={inPlace}
                  onChange={handleInputChange}
                  // 失焦即提交最后输入，避免紧接着卸载时取消防抖更新。
                  onBlur={() => flushChange()}
                  onDidMount={onEditorMount}
                  onWillUnmount={onEditorUnmount}
                  onKeyDown={onSourceKeyDown}
                />
              </div>
              {delimiters && (
                <span className="font-tau-mono text-[0.85em] leading-[1.85] text-[var(--ed-text-tertiary)] select-none">
                  {delimiters}
                </span>
              )}
            </div>
          )}
          {inlineError ? (
            <ErrorBar message={inlineError.message} stale={inlineError.stale && !isEmpty} />
          ) : (
            editing && !isEmpty && !inPlace && <div className="h-px bg-[var(--ed-border)]" />
          )}
          {(inPlace && editing) || !isEmpty ? (
            preview
          ) : (
            <EmptySourcePlaceholder
              title={title}
              readOnly={readOnly}
              hint="点击"
              onClick={startEditing}
            />
          )}
          <If condition={!editing && !isEmpty}>{toolbar}</If>
        </div>
        {!(readOnly && isLast) && (
          <AddParagraph ref={addParagraphRef} element={element} onAddParagraph={onAddParagraph} />
        )}
      </div>
    );
  }
);

function PreviewWithEditor(props: PropsWithChildren<IPreviewWithEditorProps>) {
  return useTouchInteraction() && !props.inPlace ? (
    <TouchPreviewWithEditor {...props} />
  ) : (
    <PointerPreviewWithEditor {...props} />
  );
}
export default PreviewWithEditor;
