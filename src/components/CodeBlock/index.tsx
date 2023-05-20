import { UnControlled as CodeEditor } from 'react-codemirror2';
import styles from './index.module.less';
import { Editor, EditorChange } from 'codemirror';
import { useEffect, useState } from 'react';
import { LANGUAGES } from './config';

import isHotkey from "is-hotkey";
import {RenderElementProps, useSlate } from "slate-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { CodeBlockElement } from "../../custom-types";
import {message} from "antd";
import AddParagraph from "../AddParagraph";

interface ICodeBlockProps {
  attributes: RenderElementProps['attributes'];
  onChange: (code: string) => void;
  element: CodeBlockElement;
  onDidMount?: (editor: Editor) => void;
  onWillUnmount?: (editor: Editor) => void;
}

interface ILanguageConfig {
  name: string;
  mode: string;
  mime?: string;
}

const CodeBlock: React.FC<React.PropsWithChildren<ICodeBlockProps>> = (props) => {
  const { onChange, children, element, onDidMount, onWillUnmount, attributes } = props;
  const { code: defaultCode, language, uuid } = element;
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

  const handleCopyCode = async () => {
    const editor = slateEditor.codeBlockMap.get(uuid);
    if (navigator.clipboard && editor) {
      const code = editor.getValue();
      await navigator.clipboard.writeText(code);
      await message.success('复制代码成功');
    } else {
      await message.error('复制代码失败');
    }
  }

  return (
    <div contentEditable={false} {...attributes} className={styles.codeBlockContainer}>
      {children}
      <div className={styles.windowsControl} />
      <div className={styles.copyButton} onClick={handleCopyCode}></div>
      <CodeEditor
        value={code || ''}
        autoCursor
        autoScroll
        options={{
          inputStyle: 'textarea',
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
          cursorHeight: 1,
          autoCloseBrackets: true,
          tabindex: -1,
        }}
        className={styles.CodeMirrorContainer}
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
              Transforms.setNodes(slateEditor, { type: 'paragraph', children: [{ type: 'formatted', text: '' }] }, { at: path });
              Transforms.unsetNodes(slateEditor, ['code', 'language', 'uuid'], { at: path });
              slateEditor.codeBlockMap.delete(uuid);
              ReactEditor.focus(slateEditor);
            }
          }
        }}
      />
      <AddParagraph element={element} />
    </div>
  )
}

export default CodeBlock;