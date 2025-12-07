import React, { memo } from "react";
import { UnControlled as CodeMirrorEditor } from "react-codemirror2";
import { Editor, EditorChange } from "codemirror";

interface FullscreenCodeEditorProps {
  value: string;
  options: any;
  className: string;
  onChange: (editor: Editor, change: EditorChange, code: string) => void;
  onKeyDown: (editor: Editor, event: KeyboardEvent) => void;
  editorDidMount: (editor: Editor) => void;
  editorWillUnmount: () => void;
}

const FullscreenCodeEditor: React.FC<FullscreenCodeEditorProps> = memo(
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
FullscreenCodeEditor.displayName = "FullscreenCodeEditor";

export default FullscreenCodeEditor;
