import React, {
  PropsWithChildren,
  useRef,
  useState,
  memo,
  useEffect,
} from "react";
import { UnControlled as CodeEditor } from "react-codemirror2";
import { Editor, EditorChange } from "codemirror";
import classnames from "classnames";
import { useClickAway, useDebounceFn, useMemoizedFn } from "ahooks";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { ErrorBoundary } from "@tau/shared";
import { PortalToBody } from "@tau/shared";
import { Transforms, Path, Element, Node } from "slate";
import isHotkey from "is-hotkey";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { Edit3, Maximize2, Trash2 } from "lucide-react";

import useTheme from "../../hooks/useTheme";

import useDragAndDrop from "../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../hooks/useDragHandlerMenu";

import If from "../If";
import AddParagraph, { AddParagraphRef } from "../AddParagraph";
import EditorContextMenu from "../EditorContextMenu";
import { MdDragIndicator } from "react-icons/md";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";

import { CustomElement } from "../../types";
import styles from "./index.module.less";
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
}

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> =
  memo((props) => {
    const { mode, initValue, onChange, children, element, center, extend } =
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
    const {
      drag,
      drop,
      isDragging,
      isBefore,
      isOverCurrent,
      canDrop,
      canDrag,
    } = useDragAndDrop({
      element,
    });

    const { menuProps, dragHandlerProps } = useDragHandlerMenu({
      element,
      editor: slateEditor,
      buildMenuItems: ({ path }) => [
        {
          key: "edit",
          label: "编辑",
          icon: <Edit3 size={16} />,
          onSelect: () => setEditing(true),
        },
        {
          key: "fullscreen",
          label: "全屏",
          icon: <Maximize2 size={16} />,
          onSelect: () => setIsFullscreen(true),
        },
        {
          key: "delete",
          label: "删除",
          icon: <Trash2 size={16} />,
          danger: true,
          onSelect: () => {
            Transforms.removeNodes(slateEditor, { at: path });
          },
        },
      ],
    });

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
      if (
        fullscreenEditorRef.current &&
        fullscreenEditorRef.current.getValue() !== nextValue
      ) {
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
        },
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
      },
    );
    const handleInputChange = useMemoizedFn(
      (editor: Editor, change: EditorChange, code: string) => {
        pendingLocalValueRef.current = code;
        emitChange(editor, change, code);
      },
    );

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

    const containerClassName = classnames(styles.container, {
      [styles.editing]: editing,
      [styles.dark]: isDark,
      [styles.dragging]: isDragging,
      [styles.drop]: isOverCurrent && canDrop,
      [styles.before]: isBefore,
      [styles.after]: !isBefore,
    });

    return (
      <div className={classnames(styles.dropContainer)}>
        <div contentEditable={false} ref={ref} className={containerClassName}>
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
              className={styles.editor}
              onChange={handleInputChange}
              editorDidMount={(editor) => {
                editorRef.current = editor;
              }}
              editorWillUnmount={() => {
                editorRef.current = null;
              }}
              onKeyDown={onCodeEditorKeyDown}
            />
          </div>
          <If condition={editing}>
            <div className={styles.divider}></div>
          </If>
          <div
            ref={(node) => {
              drop(node);
            }}
            className={classnames(styles.preview, {
              [styles.center]: center,
              [styles.extend]: extend,
            })}
            onClick={onClick}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
          <If condition={!readOnly}>
            <div className={styles.actions}>
              <div onClick={toggleFullscreen} className={styles.item}>
                <MdFullscreen />
              </div>
              <div onClick={editElement} className={styles.item}>
                <EditOutlined />
              </div>
              <div onClick={deleteElement} className={styles.item}>
                <DeleteOutlined />
              </div>
            </div>
          </If>
        </div>
        {!(readOnly && isLast) && (
          <AddParagraph
            ref={addParagraphRef}
            element={element}
            onAddParagraph={onAddParagraph}
          />
        )}
        <div
          contentEditable={false}
          ref={
            canDrag
              ? (node) => {
                  drag(node);
                }
              : undefined
          }
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
          onClick={dragHandlerProps.onClick}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <EditorContextMenu {...menuProps} readonly={readOnly} />
        <If condition={isFullscreen}>
          <PortalToBody>
            <div
              className={classnames(styles.fullscreenOverlay, {
                [styles.darkOverlay]: isDark,
              })}
              onClick={toggleFullscreen}
            >
              <div
                className={classnames(styles.fullscreenContent, {
                  [styles.dark]: isDark,
                })}
                onClick={(e) => e.stopPropagation()}
                ref={fullscreenRef}
              >
                <If condition={fullscreenEditing}>
                  <div className={styles.fullscreenEditorContainer}>
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
                      className={styles.fullscreenEditor}
                      onChange={handleInputChange}
                      editorDidMount={(editor) => {
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
                    <div className={styles.divider}></div>
                  </div>
                </If>
                <div
                  className={classnames(styles.fullscreenPreview, {
                    [styles.center]: center,
                    [styles.extend]: extend,
                    [styles.withEditor]: fullscreenEditing,
                  })}
                >
                  <ErrorBoundary>{children}</ErrorBoundary>
                </div>
                <div
                  className={styles.fullscreenControls}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className={styles.closeButton}
                    onClick={toggleFullscreen}
                  >
                    <MdFullscreenExit />
                  </div>
                  {!readOnly && (
                    <div
                      className={classnames(styles.editButton, {
                        [styles.active]: fullscreenEditing,
                      })}
                      onClick={toggleFullscreenEditing}
                    >
                      <EditOutlined />
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
