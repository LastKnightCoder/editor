import React, { PropsWithChildren, useRef, useState, memo, useEffect, lazy, Suspense } from "react";
import type { Editor, EditorChange } from "codemirror";
import { cn } from "@tau/ui";
import { useClickAway, useDebounceFn, useMemoizedFn } from "ahooks";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { ErrorBoundary } from "@tau/shared";
import { Transforms, Path, Element, Node } from "slate";
import isHotkey from "is-hotkey";
import { Check, Copy, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { If } from "@tau/shared";
import { AddParagraph, type AddParagraphRef } from "@tau/editor/api";
import { previewActionsMap } from "./menu";
import { PreviewErrorContext, type PreviewError } from "./previewError";
import { ErrorBar, KindLabel } from "./parts";
import { FloatingToolbar, ToolbarDivider, ToolbarIconButton } from "@tau/editor/api";

import type { CustomElement } from "@tau/editor/api";
import "./PreviewWithEditor.vendor.css";
import { useIsLastElement } from "@tau/editor/api";
import {
  registerBlockNavigation,
  unregisterBlockNavigation,
  focusPreviousBlock,
  focusNextBlock,
} from "@tau/editor/api";

const CodeEditor = lazy(() => import("./SourceCodeEditor"));

interface IPreviewWithEditorProps {
  mode: string;
  /** 块类型名，显示在编辑标题行与空块占位 */
  title: string;
  icon: LucideIcon;
  initValue: string;
  onChange: (value: string) => void;
  element: CustomElement;
  center?: boolean;
  extend?: boolean;
}

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = memo(props => {
  const { mode, title, icon, initValue, onChange, children, element, center, extend } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initValue);
  const [copied, setCopied] = useState(false);
  const [inlineError, setInlineError] = useState<PreviewError | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const pendingLocalValueRef = useRef<string | null>(null);
  const pendingFocusRef = useRef<"start" | "end" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const slateEditor = useSlateStatic();
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  // 编辑中 value 不随输入同步（见 pendingLocalValueRef），空态以已落库的源码为准
  const isEmpty = !initValue?.trim();

  const {
    run: emitChange,
    flush: flushChange,
    cancel: cancelChange,
  } = useDebounceFn((_editor: Editor, _change: EditorChange, code: string) => onChange(code), {
    wait: 500,
  });

  const focusSource = useMemoizedFn(() => {
    requestAnimationFrame(() => {
      editorRef.current?.refresh();
      editorRef.current?.focus();
    });
  });

  const startEditing = useMemoizedFn(() => {
    if (readOnly) return;
    setEditing(true);
    focusSource();
  });

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
    if (pendingLocalValueRef.current === nextValue) {
      pendingLocalValueRef.current = null;
      return;
    }
    pendingLocalValueRef.current = null;
    cancelChange();
    setValue(nextValue);
    if (editorRef.current && editorRef.current.getValue() !== nextValue) {
      editorRef.current.setValue(nextValue);
    }
  }, [initValue, cancelChange]);

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
    const editorInstance = editorRef.current;
    if (!editorInstance) return true;
    const doc = editorInstance.getDoc();
    const targetLine = position === "end" ? doc.lastLine() : doc.firstLine();
    editorInstance.focus();
    doc.setCursor({
      line: targetLine,
      ch: position === "end" ? doc.getLine(targetLine)?.length || 0 : 0,
    });
    pendingFocusRef.current = null;
    return true;
  });

  useEffect(() => {
    const handleFocus = (e: any) => {
      const detail = e.detail;
      if (readOnly) {
        return;
      }
      let matched = detail === element || detail?.element === element;
      if (!matched && Array.isArray(detail?.path)) {
        try {
          const currentPath = ReactEditor.findPath(slateEditor, element);
          matched = Path.equals(currentPath, detail.path as number[]);
        } catch {
          matched = false;
        }
      }
      if (!matched) {
        return;
      }
      focusPreviewEditor("start");
    };

    document.addEventListener("preview-editor-focus", handleFocus);

    return () => {
      document.removeEventListener("preview-editor-focus", handleFocus);
    };
  }, [element, readOnly, slateEditor, focusPreviewEditor]);

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

  const onCodeEditorKeyDown = useMemoizedFn((editor, event) => {
    if (readOnly) return;
    const editorValue = editor.getValue();
    if (
      editorValue.trim().length === 0 &&
      (isHotkey("backspace", event) || isHotkey("delete", event))
    ) {
      event.preventDefault();
      event.stopPropagation();
      deleteElement();
      return;
    }
    const cursor = editor.getCursor();
    const lastLine = editor.lastLine();
    const lastCh = editor.getLine(lastLine).length;

    const tryFocusOuterBlock = (direction: "backward" | "forward") => {
      const path = ReactEditor.findPath(slateEditor, element);
      const meta = {
        reason: "arrow",
        direction,
      } as const;
      const focused =
        direction === "backward"
          ? focusPreviousBlock(slateEditor, path, meta)
          : focusNextBlock(slateEditor, path, meta);
      if (focused) {
        finishEditing();
        event.preventDefault();
      }
      return focused;
    };

    if (isHotkey("up", event)) {
      if (cursor.line === 0 && cursor.ch === 0) {
        if (tryFocusOuterBlock("backward")) {
          return;
        }
      }
      return;
    }

    if (isHotkey("down", event)) {
      if (cursor.line === lastLine && cursor.ch === lastCh) {
        if (tryFocusOuterBlock("forward")) {
          return;
        }
        // 如果无法聚焦其他块，沿用原有逻辑
        const path = ReactEditor.findPath(slateEditor, element);
        const nextPath = Path.next(path);
        try {
          const nextElement = Node.get(slateEditor, nextPath);
          if (nextElement && Element.isElement(nextElement)) {
            const focusEvent = new CustomEvent("element-focus-start", {
              detail: {
                focusElement: nextElement,
                start: true,
              },
            });
            document.dispatchEvent(focusEvent);
          } else {
            addParagraphRef.current?.addParagraph();
          }
        } catch (e) {
          addParagraphRef.current?.addParagraph();
        } finally {
          finishEditing();
          event.preventDefault();
        }
      }
    }
  });

  const onAddParagraph = useMemoizedFn(() => {
    finishEditing();
  });

  useEffect(() => {
    registerBlockNavigation(element, {
      focusStart: () => focusPreviewEditor("start"),
      focusEnd: () => focusPreviewEditor("end"),
    });

    return () => {
      unregisterBlockNavigation(element);
    };
  }, [element, focusPreviewEditor]);

  const handleInputChange = useMemoizedFn((editor: Editor, change: EditorChange, code: string) => {
    pendingLocalValueRef.current = code;
    emitChange(editor, change, code);
  });

  const copySource = useMemoizedFn(() => {
    void navigator.clipboard.writeText(initValue || "").then(() => setCopied(true));
  });

  // 预览菜单复用同一个编辑入口。
  useEffect(() => {
    previewActionsMap.set(element, {
      edit: startEditing,
    });
    return () => {
      previewActionsMap.delete(element);
    };
  }, [element, startEditing]);

  const preview = (
    <PreviewErrorContext.Provider value={setInlineError}>
      <div
        className={cn(
          // 内容矮于最小高度时垂直居中，单行公式上下留白一致；3em 恰好容纳居中的悬浮操作条
          "box-border min-h-[3em] whitespace-normal transition-opacity duration-150",
          extend && "py-[0.3125em]",
          center ? "flex items-center justify-center" : "flex flex-col justify-center",
          inlineError?.stale && "opacity-40"
        )}
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
          // 悬停时显示右上角操作条（此块不会嵌套自身）；描边常驻透明，进入编辑不跳动
          "group/preview relative rounded-[0.625em] border border-transparent transition-colors duration-150",
          editing && "overflow-hidden border-[var(--ed-border)]"
        )}
      >
        <If condition={editing}>
          <div className="flex h-[2.25em] items-center gap-[0.25em] bg-[var(--ed-code-bg)] pl-[1em] pr-[0.375em]">
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
          <Suspense fallback={<div className="p-4">正在加载编辑器…</div>}>
            <div className="max-h-[50vh] overflow-y-auto">
              <CodeEditor
                value={value || ""}
                autoCursor
                autoScroll
                mode={mode}
                readOnly={readOnly}
                className="ed-preview-codemirror h-auto"
                onChange={handleInputChange}
                editorDidMount={editor => {
                  editorRef.current = editor;
                  const position = pendingFocusRef.current;
                  if (position) focusPreviewEditor(position);
                  else editor.focus();
                }}
                editorWillUnmount={() => {
                  editorRef.current = null;
                }}
                onKeyDown={onCodeEditorKeyDown}
              />
            </div>
          </Suspense>
        )}
        {inlineError ? (
          <ErrorBar message={inlineError.message} stale={inlineError.stale && !isEmpty} />
        ) : (
          editing && !isEmpty && <div className="h-px bg-[var(--ed-border)]" />
        )}
        {isEmpty
          ? !editing && (
              <div
                className="flex h-[3.5em] cursor-pointer select-none items-center justify-center gap-[0.5em] rounded-[0.5625em] bg-[repeating-linear-gradient(-45deg,transparent_0_7px,var(--ed-bg-hover)_7px_8px)] text-[0.9em] text-[var(--ed-text-tertiary)] shadow-[inset_0_0_0_1px_var(--ed-border)] transition-[color,box-shadow] duration-150 hover:text-[var(--ed-text-secondary)] hover:shadow-[inset_0_0_0_1px_var(--ed-text-tertiary)]"
                onClick={startEditing}
              >
                <Plus size="1.05em" strokeWidth={1.9} />
                {readOnly ? `空的${title}` : `${title} · 点击开始编写`}
              </div>
            )
          : preview}
        <If condition={!editing && !isEmpty}>{toolbar}</If>
      </div>
      {!(readOnly && isLast) && (
        <AddParagraph ref={addParagraphRef} element={element} onAddParagraph={onAddParagraph} />
      )}
    </div>
  );
});

export default PreviewWithEditor;
