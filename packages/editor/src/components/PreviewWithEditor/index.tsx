import React, { PropsWithChildren, useRef, useState, memo, useEffect } from "react";
import { UnControlled as CodeEditor } from "react-codemirror2";
import { Editor, EditorChange } from "codemirror";
import { cn } from "@tau/ui";
import { useClickAway, useDebounceFn, useMemoizedFn } from "ahooks";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { ErrorBoundary } from "@tau/shared";
import { PortalToBody } from "@tau/shared";
import { Transforms, Path, Element, Node } from "slate";
import isHotkey from "is-hotkey";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { Pencil, Trash2 } from "lucide-react";

import useTheme from "../../hooks/useTheme";

import useDragAndDrop from "../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../hooks/useDragHandlerMenu";

import If from "../If";
import AddParagraph, { AddParagraphRef } from "../AddParagraph";
import EditorContextMenu from "../EditorContextMenu";
import { BLOCK_DRAG_GROUP, DragHandle, DropIndicator, dimWhileDragging } from "../BlockDrag";
import { previewActionsMap } from "./menu";

import { CustomElement } from "../../types";
import type { BuildMenuParams, ContextMenuItem } from "../EditorContextMenu/types";
import "./PreviewWithEditor.vendor.css";
import useIsLastElement from "../../hooks/useIsLastElement";
import {
  registerBlockNavigation,
  unregisterBlockNavigation,
  focusPreviousBlock,
  focusNextBlock,
} from "../../utils";

interface IPreviewWithEditorProps {
  mode: string;
  initValue: string;
  onChange: (value: string) => void;
  element: CustomElement;
  center?: boolean;
  extend?: boolean;
  extraMenuItemsBuilder?: (params: BuildMenuParams<CustomElement>) => ContextMenuItem[];
}

const ACTION_ITEM_CLASS = "flex h-[1.75em] w-[1.75em] cursor-pointer items-center justify-center";

const FULLSCREEN_BUTTON_CLASS =
  "flex h-[1.75em] w-[1.75em] cursor-pointer items-center justify-center rounded-[0.25em] transition-all duration-200 hover:bg-[var(--ed-bg-hover)]";

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = memo(props => {
  const { mode, initValue, onChange, children, element, center, extend, extraMenuItemsBuilder } =
    props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initValue);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenEditing, setFullscreenEditing] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const fullscreenEditorRef = useRef<Editor | null>(null);
  const pendingLocalValueRef = useRef<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const slateEditor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const isLast = useIsLastElement(element);
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
  });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor: slateEditor,
    extraItems: ({ path }) =>
      extraMenuItemsBuilder?.({
        element,
        editor: slateEditor,
        path,
      }) ?? [],
  });

  // 「编辑 / 全屏」菜单命令（tau.preview.*）从这里取动作
  useEffect(() => {
    previewActionsMap.set(element, {
      edit: () => setEditing(true),
      fullscreen: () => setIsFullscreen(true),
    });
    return () => {
      previewActionsMap.delete(element);
    };
  }, [element]);

  useClickAway(() => {
    if (editing && !isFullscreen) {
      setEditing(false);
      setValue(editorRef.current?.getValue() || "");
    }
  }, ref);

  useClickAway(() => {
    if (fullscreenEditing && isFullscreen) {
      setFullscreenEditing(false);
      setValue(fullscreenEditorRef.current?.getValue() || "");
    }
  }, fullscreenRef);

  useEffect(() => {
    const nextValue = initValue || "";
    if (pendingLocalValueRef.current === nextValue) {
      pendingLocalValueRef.current = null;
      return;
    }
    pendingLocalValueRef.current = null;
    setValue(nextValue);
    if (editorRef.current && editorRef.current.getValue() !== nextValue) {
      editorRef.current.setValue(nextValue);
    }
    if (fullscreenEditorRef.current && fullscreenEditorRef.current.getValue() !== nextValue) {
      fullscreenEditorRef.current.setValue(nextValue);
    }
  }, [initValue]);

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
      setEditing(true);
      const focusEditor = () => {
        const editorInstance = editorRef.current;
        if (!editorInstance) {
          return;
        }
        const doc = editorInstance.getDoc();
        const firstLine = doc.firstLine();
        editorInstance.focus();
        doc.setCursor({
          line: firstLine,
          ch: 0,
        });
      };
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(focusEditor);
        return;
      }
      setTimeout(focusEditor, 0);
    };

    document.addEventListener("preview-editor-focus", handleFocus);

    return () => {
      document.removeEventListener("preview-editor-focus", handleFocus);
    };
  }, [element, readOnly, slateEditor]);

  const onClick = useMemoizedFn(() => {
    if (readOnly || editorRef.current?.getValue()) {
      return;
    }
    setEditing(true);
  });

  const deleteElement = useMemoizedFn(() => {
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
        setEditing(false);
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
          setEditing(false);
          event.preventDefault();
        }
      }
    }
  });

  const onAddParagraph = useMemoizedFn(() => {
    setEditing(false);
  });

  const scrollIntoView = () => {
    try {
      const dom = ReactEditor.toDOMNode(slateEditor, element);
      dom.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } catch (e) {
      // ignore
    }
  };

  const focusPreviewEditor = useMemoizedFn((position: "start" | "end") => {
    const editorInstance = editorRef.current;
    if (!editorInstance) {
      return false;
    }
    scrollIntoView();
    const doc = editorInstance.getDoc();
    const targetLine = position === "end" ? doc.lastLine() : doc.firstLine();
    const targetLength = doc.getLine(targetLine)?.length || 0;
    setEditing(true);
    editorInstance.focus();
    doc.setCursor({
      line: targetLine,
      ch: position === "end" ? targetLength : 0,
    });
    return true;
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

  const { run: emitChange } = useDebounceFn(
    (_editor: Editor, _change: EditorChange, code: string) => {
      onChange(code);
    },
    {
      wait: 500,
    }
  );
  const handleInputChange = useMemoizedFn((editor: Editor, change: EditorChange, code: string) => {
    pendingLocalValueRef.current = code;
    emitChange(editor, change, code);
  });

  const editElement = useMemoizedFn(() => {
    setEditing(true);
  });

  const toggleFullscreen = useMemoizedFn(() => {
    if (isFullscreen) {
      let nextValue = value || "";
      if (fullscreenEditing && fullscreenEditorRef.current) {
        nextValue = fullscreenEditorRef.current.getValue() || "";
      } else if (editorRef.current) {
        nextValue = editorRef.current.getValue() || nextValue;
      }
      setValue(nextValue);
      if (editorRef.current) {
        editorRef.current.setValue(nextValue);
        editorRef.current.focus();
      }
      if (fullscreenEditing) {
        setFullscreenEditing(false);
        setEditing(true);
      } else {
        setEditing(false);
      }
      setIsFullscreen(false);
      return;
    }

    const currentValue = editorRef.current?.getValue() || value || "";
    setValue(currentValue);
    fullscreenEditorRef.current?.setValue(currentValue);
    if (editing) {
      setFullscreenEditing(true);
      setEditing(false);
      setTimeout(() => {
        if (fullscreenEditorRef.current) {
          fullscreenEditorRef.current.focus();
        }
      }, 50);
    }
    setIsFullscreen(true);
  });

  const toggleFullscreenEditing = useMemoizedFn(() => {
    setFullscreenEditing(!fullscreenEditing);

    if (!fullscreenEditing) {
      setTimeout(() => {
        if (fullscreenEditorRef.current) {
          fullscreenEditorRef.current.refresh();
          fullscreenEditorRef.current.focus();
        }
      }, 50);
    }
  });

  const containerClassName = cn(
    // 悬停时显示右上角操作条（此块不会嵌套自身）
    "group/preview relative",
    editing && "bg-[var(--ed-code-bg)] pb-[1.25em]",
    dimWhileDragging(isDragging || (isOverCurrent && canDrop))
  );

  return (
    <div className={cn("relative", BLOCK_DRAG_GROUP)}>
      <div contentEditable={false} ref={ref} className={containerClassName}>
        <DropIndicator active={isOverCurrent && canDrop} before={isBefore} />
        <div
          style={{
            height: editing ? "auto" : 0,
            maxHeight: editing ? "50vh" : 0,
            overflowY: editing ? "auto" : "hidden",
          }}
        >
          <CodeEditor
            value={value || ""}
            autoCursor
            autoScroll
            options={{
              mode,
              theme: isDark ? "blackboard" : "one-light",
              lineNumbers: false,
              firstLineNumber: 1,
              scrollbarStyle: "native",
              viewportMargin: 10,
              lineWrapping: false,
              smartIndent: true,
              extraKeys: {
                "Shift-Tab": "indentLess",
              },
              readOnly,
              indentUnit: 2,
              tabSize: 2,
              cursorHeight: 1,
              autoCloseBrackets: true,
              tabindex: -1,
            }}
            className="ed-preview-codemirror h-auto px-[0.75em] pt-[1.125em]"
            onChange={handleInputChange}
            editorDidMount={editor => {
              editorRef.current = editor;
            }}
            editorWillUnmount={() => {
              editorRef.current = null;
            }}
            onKeyDown={onCodeEditorKeyDown}
          />
        </div>
        <If condition={editing}>
          <div className="mx-[1.25em] mb-[1.25em] h-[0.125em] bg-[var(--ed-border)]"></div>
        </If>
        <div
          ref={node => {
            drop(node);
          }}
          className={cn(
            "box-border min-h-[2.5em] whitespace-normal",
            extend && "py-[0.3125em]",
            center && "flex items-center justify-center"
          )}
          onClick={onClick}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
        <If condition={!readOnly}>
          {/* 压在预览上的固定深色操作条，不随主题 */}
          <div className="absolute right-[0.625em] top-[0.625em] hidden rounded-[0.5em] bg-[rgba(38,38,38,0.6)] text-white group-hover/preview:flex">
            <div onClick={toggleFullscreen} className={ACTION_ITEM_CLASS}>
              <MdFullscreen />
            </div>
            <div onClick={editElement} className={ACTION_ITEM_CLASS}>
              <Pencil size="1em" />
            </div>
            <div onClick={deleteElement} className={ACTION_ITEM_CLASS}>
              <Trash2 size="1em" />
            </div>
          </div>
        </If>
      </div>
      {!(readOnly && isLast) && (
        <AddParagraph ref={addParagraphRef} element={element} onAddParagraph={onAddParagraph} />
      )}
      <DragHandle
        dragRef={
          canDrag
            ? node => {
                drag(node);
              }
            : () => {}
        }
        canDrag={canDrag}
        onClick={dragHandlerProps.onClick}
      />
      <EditorContextMenu {...menuProps} readonly={readOnly} />
      <If condition={isFullscreen}>
        <PortalToBody>
          <div
            className="fixed inset-0 z-[1001] flex items-center justify-center bg-[var(--ed-glass-bg)] text-[1.2em] backdrop-blur-[var(--ed-glass-blur)]"
            onClick={toggleFullscreen}
          >
            <div
              className="relative box-border flex h-[90%] w-[90%] flex-col overflow-hidden rounded-[0.5em] bg-[var(--ed-glass-bg)] px-[1.5em] py-[2.25em] shadow-[var(--ed-shadow-float)] backdrop-blur-[var(--ed-glass-blur)]"
              onClick={e => e.stopPropagation()}
              ref={fullscreenRef}
            >
              <If condition={fullscreenEditing}>
                <div className="relative z-[2] mb-[1.25em] max-h-[50vh] overflow-y-auto pb-[1.25em]">
                  <CodeEditor
                    key="fullscreen-editor"
                    value={value || ""}
                    autoCursor
                    autoScroll
                    options={{
                      mode,
                      theme: isDark ? "blackboard" : "one-light",
                      lineNumbers: true,
                      firstLineNumber: 1,
                      scrollbarStyle: "native",
                      viewportMargin: 10,
                      lineWrapping: false,
                      smartIndent: true,
                      extraKeys: {
                        "Shift-Tab": "indentLess",
                      },
                      readOnly,
                      indentUnit: 2,
                      tabSize: 2,
                      cursorHeight: 1,
                      autoCloseBrackets: true,
                      tabindex: -1,
                    }}
                    className="ed-preview-codemirror h-full [--ed-cm-line-pad:0.75em]"
                    onChange={handleInputChange}
                    editorDidMount={editor => {
                      fullscreenEditorRef.current = editor;
                      setTimeout(() => {
                        editor.refresh();
                        editor.focus();
                      }, 50);
                    }}
                    editorWillUnmount={() => {
                      fullscreenEditorRef.current = null;
                    }}
                  />
                  <div className="mx-[1.25em] mb-[1.25em] h-[0.125em] bg-[var(--ed-border)]"></div>
                </div>
              </If>
              <div
                className={cn(
                  "relative z-[1] min-h-[2.5em] flex-1 overflow-auto",
                  center && "flex items-center justify-center"
                )}
              >
                <ErrorBoundary>{children}</ErrorBoundary>
              </div>
              <div
                className="absolute right-[0.625em] top-[0.625em] z-[100] flex gap-[0.5em]"
                onClick={e => e.stopPropagation()}
              >
                <div className={FULLSCREEN_BUTTON_CLASS} onClick={toggleFullscreen}>
                  <MdFullscreenExit />
                </div>
                {!readOnly && (
                  <div className={FULLSCREEN_BUTTON_CLASS} onClick={toggleFullscreenEditing}>
                    <Pencil size="1em" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </PortalToBody>
      </If>
    </div>
  );
});

export default PreviewWithEditor;
