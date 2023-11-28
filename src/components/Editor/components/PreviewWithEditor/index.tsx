import React, { PropsWithChildren, useRef, useState } from "react";
import { UnControlled as CodeEditor } from "react-codemirror2";
import { Editor, EditorChange } from "codemirror";
import classnames from "classnames";
import { useClickAway, useDebounceFn } from "ahooks";
import { ReactEditor, useSlate, useReadOnly } from "slate-react";
import { Transforms } from "slate";
import { DeleteOutlined } from "@ant-design/icons";

import useTheme from "@/hooks/useTheme.ts";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import { MdDragIndicator } from "react-icons/md";
import AddParagraph from "../AddParagraph";

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

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = (props) => {
  const { mode, initValue, onChange, children, element, center, extend } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initValue);
  const [editor, setEditor] = useState<Editor | null>(null);
  const ref= useRef<HTMLDivElement>(null);
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
      setValue(editor?.getValue() || '');
    }
  }, ref);

  const onClick = () => {
    if (readOnly) {
      return;
    }
    setEditing(true);
  }

  const { run: handleInputChange } = useDebounceFn((_editor: Editor, _change: EditorChange, code: string) => {
    onChange(code);
  }, {
    wait: 500
  });

  const deleteElement = () => {
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
  }

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
          editing &&
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
            editorDidMount={(editor) => { setEditor(editor) }}
            editorWillUnmount={() => { setEditor(null) }}
          />
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
      <AddParagraph element={element} />
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default PreviewWithEditor;