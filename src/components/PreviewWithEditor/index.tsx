import React, {PropsWithChildren, useRef, useState} from "react";
import {UnControlled as CodeEditor} from "react-codemirror2";
import {Editor, EditorChange} from "codemirror";
import styles from "./index.module.less";
import AddParagraph from "../AddParagraph";
import {CustomElement} from "../../types";
import classnames from "classnames";
import { useClickAway } from "ahooks";

interface IPreviewWithEditorProps {
  mode: string;
  initValue: string;
  onChange: (value: string) => void;
  element: CustomElement;
}

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = (props) => {
  const { mode, initValue, onChange, children, element } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initValue);
  const [editor, setEditor] = useState<Editor | null>(null);
  const ref= useRef<HTMLDivElement>(null);
  useClickAway(() => {
    if (editing) {
      setEditing(false);
      setValue(editor?.getValue() || '');
    }
  }, ref);
  const onClick = () => {
    setEditing(true);
    if (editor) {
      editor.focus();
    }
  }
  const handleInputChange = (_editor: Editor, _change: EditorChange, code: string) => {
    onChange(code);
  }

  return (
    <div>
      <div ref={ref} className={classnames(styles.container, { [styles.editing]: editing })}>
        {
          editing &&
          <CodeEditor
            value={value || ''}
            autoCursor
            autoScroll
            options={{
              mode,
              theme: 'one-light',
              lineNumbers: true,
              firstLineNumber: 1,
              scrollbarStyle: "null",
              viewportMargin: Infinity,
              lineWrapping: false,
              smartIndent: true,
              extraKeys: {
                'Shift-Tab': 'indentLess',
              },
              readOnly: false,
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
        { editing && <div className={styles.divider}></div> }
        <div className={styles.preview} onClick={onClick}>
          {children}
        </div>
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default PreviewWithEditor;