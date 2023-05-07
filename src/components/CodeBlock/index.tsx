import { UnControlled as CodeEditor } from 'react-codemirror2';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/blackboard.css';
import styles from './index.module.less';
import { Editor, EditorChange } from 'codemirror';
import { useEffect, useState } from 'react';
import { LANGUAGES } from './config';

import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/jsx/jsx.js';
import 'codemirror/mode/rust/rust.js';
import 'codemirror/mode/go/go.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/shell/shell.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/mode/markdown/markdown.js';

import isHotkey from "is-hotkey";
import {RenderElementProps, useSlate} from "slate-react";
import { Transforms, Editor as SlateEditor } from "slate";
import { ReactEditor } from "slate-react";
import { CodeBlockElement } from "../../custom-types";

interface ICodeBlockProps {
  attributes: RenderElementProps['attributes'];
  onChange: (code: string) => void;
  children: React.ReactNode;
  element: CodeBlockElement;
  onDidMount?: (editor: Editor) => void;
  onWillUnmount?: (editor: Editor) => void;
}

interface ILanguageConfig {
  name: string;
  mode: string;
  mime?: string;
}

const CodeBlock: React.FC<ICodeBlockProps> = (props) => {
  const { onChange, children, element, onDidMount, onWillUnmount, attributes } = props;
  const { code: defaultCode, language } = element;
  const [code] = useState(defaultCode);
  const [langConfig, setLangConfig] = useState<ILanguageConfig>();
  const slateEditor = useSlate();
  useEffect(() => {
    const languageConfig = LANGUAGES.find((lang) => lang.name.toLowerCase() === language);
    if (!languageConfig) {
      return;
    }
    setLangConfig(languageConfig);
  }, [language]);

  const handleOnChange = (_editor: Editor, _change: EditorChange, code: string) => {
    onChange(code);
  }

  return (
    <div {...attributes} className={styles.codeBlockContainer}>
      <CodeEditor
        value={code || ''}
        autoCursor
        autoScroll
        options={{
          mode: langConfig?.mime || langConfig?.mode || 'text/plain',
          theme: 'blackboard',
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
          cursorHeight: 0.8,
        }}
        className='CodeMirror__container'
        onChange={handleOnChange}
        editorDidMount={(editor) => {
          onDidMount && onDidMount(editor);
        }}
        editorWillUnmount={(editor) => {
          onWillUnmount && onWillUnmount(editor);
        }}
        onKeyDown={(editor, event) => {
          if(isHotkey(['delete', 'backspace'], event)) {
            if (editor.getValue() === '') {
              event.preventDefault();
              const path = ReactEditor.findPath(slateEditor, element);
              Transforms.removeNodes(slateEditor, { at: path });
              SlateEditor.insertNode(slateEditor, { type: 'paragraph', children: [{ type: 'normal', text: '' }] });
              setTimeout(() => {
                ReactEditor.focus(slateEditor);
                Transforms.select(slateEditor, path);
              }, 0);
            }
          }
        }}
      />
      <div style={{ display: 'none' }}>
        {children}
      </div>
    </div>
  )
}

export default CodeBlock;