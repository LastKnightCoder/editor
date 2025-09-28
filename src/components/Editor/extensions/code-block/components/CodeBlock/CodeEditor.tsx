import React, { memo } from "react";
import { UnControlled as CodeMirrorEditor } from "react-codemirror2";
import { Editor, EditorChange, EditorConfiguration } from "codemirror";

interface CodeEditorProps {
  value: string;
  options: EditorConfiguration;
  className?: string;
  onChange: (editor: Editor, change: EditorChange, code: string) => void;
  onKeyDown: (editor: Editor, event: KeyboardEvent) => void;
  editorDidMount: (editor: Editor) => void;
  editorWillUnmount: (editor: Editor) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = memo(
  ({
    value,
    options,
    className,
    onChange,
    onKeyDown,
    editorDidMount,
    editorWillUnmount,
  }) => {
    return (
      <CodeMirrorEditor
        value={value}
        autoCursor
        autoScroll
        options={options}
        className={className}
        onChange={onChange}
        onKeyDown={onKeyDown}
        editorDidMount={editorDidMount}
        editorWillUnmount={editorWillUnmount}
      />
    );
  },
);
CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
