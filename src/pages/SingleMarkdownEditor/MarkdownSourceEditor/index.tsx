import React, { memo } from "react";
import { UnControlled as CodeMirrorEditor } from "react-codemirror2";
import { Editor, EditorChange, InputStyle } from "codemirror";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/addon/edit/closebrackets.js";

import "codemirror/lib/codemirror.css";
import "codemirror/theme/blackboard.css";

import styles from "./index.module.less";
import { useCreation } from "ahooks";

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (editor: Editor, change: EditorChange, code: string) => void;
  editorDidMount: (editor: Editor) => void;
  editorWillUnmount?: (editor: Editor) => void;
  isDark?: boolean;
  readonly?: boolean;
}

const MarkdownSourceEditor: React.FC<MarkdownSourceEditorProps> = memo(
  ({
    value,
    onChange,
    editorDidMount,
    editorWillUnmount,
    isDark = false,
    readonly = false,
  }) => {
    const options = {
      inputStyle: "textarea" as InputStyle,
      mode: "markdown",
      theme: isDark ? "blackboard" : "one-light",
      viewportMargin: Infinity,
      lineNumbers: true,
      firstLineNumber: 1,
      lineWrapping: true,
      smartIndent: true,
      cursorHeight: 1,
      tabindex: -1,
      extraKeys: {
        "Shift-Tab": "indentLess",
      },
      indentUnit: 2,
      tabSize: 2,
      autoCloseBrackets: true,
      readOnly: readonly,
    };

    const initValue = useCreation(() => {
      return value;
    }, []);

    return (
      <div className={styles.CodeMirrorContainer}>
        <CodeMirrorEditor
          value={initValue}
          options={options}
          onChange={onChange}
          editorDidMount={editorDidMount}
          editorWillUnmount={editorWillUnmount}
          className={styles.codeMirror}
        />
      </div>
    );
  },
);

MarkdownSourceEditor.displayName = "MarkdownSourceEditor";

export default MarkdownSourceEditor;
