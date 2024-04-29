import React, { PropsWithChildren, useRef, useState, memo, useEffect } from "react";
import { UnControlled as CodeEditor } from "react-codemirror2";
import { Editor, EditorChange } from "codemirror";
import classnames from "classnames";
import { useClickAway, useDebounceFn, useMemoizedFn } from "ahooks";
import { ReactEditor, useSlate, useReadOnly } from "slate-react";
import { Transforms, Path, Element, Node } from "slate";
import isHotkey from "is-hotkey";

import useTheme from "@/hooks/useTheme.ts";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import AddParagraph, { AddParagraphRef } from "../AddParagraph";
import { MdDragIndicator } from "react-icons/md";
import { DeleteOutlined } from "@ant-design/icons";

import { CustomElement } from "../../types";
import styles from "./index.module.less";

interface IPreviewWithEditorProps {
  mode: string;
  initValue: string;
  onChange: (value: string) => void;
  element: CustomElement;
  center?: boolean;
  extend?: boolean;
}

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = memo((props) => {
  const { mode, initValue, onChange, children, element, center, extend } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initValue);
  const editorRef = useRef<Editor>();
  const ref = useRef<HTMLDivElement>(null);
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const slateEditor = useSlate();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();

  const {
    drag,
    drop,
    isDragging,
    isBefore,
    isOverCurrent,
    canDrop,
    canDrag
  } = useDragAndDrop({
    element,
  });

  useClickAway(() => {
    if (editing) {
      setEditing(false);
      setValue(editorRef.current?.getValue() || '');
    }
  }, ref);

  useEffect(() => {
    const handleFocus = (e: any) => {
      const ele = e.detail;
      if (ele === element) {
        setEditing(true);
        editorRef.current?.focus();
      }
    }

    document.addEventListener('preview-editor-focus', handleFocus);

    return () => {
      document.removeEventListener('preview-editor-focus', handleFocus);
    }
  }, [element]);

  const onClick = useMemoizedFn(() => {
    if (readOnly) {
      return;
    }
    setEditing(true);
  });

  const onCodeEditorKeyDown = useMemoizedFn((editor, event) => {
    if (!isHotkey('down', event)) return;
    // 是否在最后一行，最后一列
    const { line, ch } = editor.getCursor();
    const lastLine = editor.lastLine();
    const lastCh = editor.getLine(lastLine).length;
    if (line === lastLine && ch === lastCh) {
      // 如果是当前 PreviewEditor 是最后一个元素，则新增，否则聚焦到下一个
      const path = ReactEditor.findPath(slateEditor, element);
      const nextPath = Path.next(path);
      try {
        const nextElement = Node.get(slateEditor, nextPath);
        if (nextElement && Element.isElement(nextElement)) {
          const focusEvent = new CustomEvent('element-focus-start', {
            detail: {
              focusElement: nextElement,
              start: true
            }
          });
          document.dispatchEvent(focusEvent)
        } else {
          addParagraphRef.current?.addParagraph();
        }
      } catch (e) {
        addParagraphRef.current?.addParagraph();
      } finally {
        setEditing(false);
      }
    }
  });

  const onAddParagraph = useMemoizedFn(() => {
    setEditing(false);
  });

  const { run: handleInputChange } = useDebounceFn((_editor: Editor, _change: EditorChange, code: string) => {
    onChange(code);
  }, {
    wait: 500
  });

  const deleteElement = useMemoizedFn(() => {
    const path = ReactEditor.findPath(slateEditor, element);
    Transforms.delete(slateEditor, {
      at: path
    });
    Transforms.insertNodes(slateEditor, {
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: ''
      }],
    }, {
      at: path,
      select: true,
    });
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
      <div
        contentEditable={false}
        ref={ref}
        className={containerClassName}>
        {
          <div style={{ height: editing ? 'auto' : 0, overflow: 'hidden' }}>
            <CodeEditor
              value={value || ''}
              autoCursor
              autoScroll
              options={{
                mode,
                theme: isDark ? 'blackboard' : 'one-light',
                lineNumbers: false,
                firstLineNumber: 1,
                scrollbarStyle: "null",
                viewportMargin: Infinity,
                lineWrapping: false,
                smartIndent: true,
                extraKeys: {
                  'Shift-Tab': 'indentLess',
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
              editorDidMount={(editor) => { editorRef.current = editor }}
              editorWillUnmount={() => { editorRef.current = undefined }}
              onKeyDown={onCodeEditorKeyDown}
            />
          </div>
        }
        <If condition={editing}>
          <div className={styles.divider}></div>
        </If>
        <div
          ref={drop}
          className={classnames(styles.preview, { [styles.center]: center, [styles.extend]: extend })}
          onClick={onClick}
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        <If condition={!readOnly}>
          <div className={styles.actions}>
            <div onClick={deleteElement} className={styles.item}>
              <DeleteOutlined />
            </div>
          </div>
        </If>
      </div>
      <AddParagraph ref={addParagraphRef} element={element} onAddParagraph={onAddParagraph} />
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
});

export default PreviewWithEditor;