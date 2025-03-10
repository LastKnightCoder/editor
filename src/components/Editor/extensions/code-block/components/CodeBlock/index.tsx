import React, { useEffect, useRef, useState } from 'react';
import { Transforms, Editor as SlateEditor } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import classnames from "classnames";
import { Editor, EditorChange } from 'codemirror';
import { message } from "antd";
import { UnControlled as CodeEditor } from 'react-codemirror2';
import isHotkey from "is-hotkey";

import { CodeBlockElement } from "@/components/Editor/types";
import AddParagraph, { AddParagraphRef } from "@/components/Editor/components/AddParagraph";
import useTheme from "@/hooks/useTheme.ts";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import SelectLanguage from "../SelectLanguage";

import copyIcon from "@/assets/icons/copy.svg";
import { MdDragIndicator } from "react-icons/md";

import { LANGUAGES } from './config';
import { codeBlockMap } from "../../index";

import styles from './index.module.less';

interface ICodeBlockProps {
  attributes: RenderElementProps['attributes'];
  onChange?: (code: string) => void;
  element: CodeBlockElement;
  onDidMount?: (editor: Editor) => void;
  onWillUnmount?: (editor: Editor) => void;
}

interface ILanguageConfig {
  name: string;
  mode: string;
  mime?: string;
}

const aliases = {
  js: 'javascript',
  ts: 'typescript',
  rs: 'rust',
  py: 'python',
  md: 'markdown',
  xml: 'html/xml',
  latex: 'stex',
  cpp: 'C++',
  sh: 'shell',
  zsh: 'shell'
}

const CodeBlock: React.FC<React.PropsWithChildren<ICodeBlockProps>> = (props) => {
  const { onChange, children, element, onDidMount, onWillUnmount, attributes } = props;
  const { code: defaultCode, language, uuid } = element;
  const [code] = useState(defaultCode);
  const [langConfig, setLangConfig] = useState<ILanguageConfig>();
  const slateEditor = useSlate();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const addParagraphRef = useRef<AddParagraphRef>(null);

  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    element,
  });

  useEffect(() => {
    // @ts-ignore
    const alias: string = aliases[language] || language;
    const languageConfig = LANGUAGES.find((lang) => lang.name.toLowerCase() === alias.toLowerCase());
    if (!languageConfig) {
      return;
    }
    setLangConfig(languageConfig);
  }, [language]);

  const handleOnChange = (_editor: Editor, _change: EditorChange, code: string) => {
    const path = ReactEditor.findPath(slateEditor, element);
    Transforms.setNodes(slateEditor, { code }, { at: path });
    onChange && onChange(code);
  }

  const handleCopyCode = async () => {
    const editor = codeBlockMap.get(uuid);
    if (navigator.clipboard && editor) {
      const code = editor.getValue();
      await navigator.clipboard.writeText(code);
      await message.success('复制代码成功');
    } else {
      await message.error('复制代码失败');
    }
  }

  const handleOnLanguageChange = (value: string) => {
    Transforms.setNodes(slateEditor, { language: value }, { at: ReactEditor.findPath(slateEditor, element) });
  }

  return (
    <div
      contentEditable={false}
      className={classnames(styles.codeBlockContainer, {
        [styles.dark]: isDark,
        [styles.readOnly]: readOnly,
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
      ref={drop}
    >
      <div
        {...attributes}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>
      {/*<div className={styles.windowsControl} />*/}
      <div
        style={{
          background: `url(${copyIcon}) no-repeat center center / 60% 60%`,
        }}
        className={styles.copyButton}
        onClick={handleCopyCode}
      />
      <SelectLanguage readonly={readOnly} className={styles.languageSelect} value={language} onChange={handleOnLanguageChange} />
      <CodeEditor
        value={code || ''}
        autoCursor
        autoScroll
        options={{
          inputStyle: 'textarea',
          mode: langConfig?.mime || langConfig?.mode || 'text/plain',
          theme: isDark ? 'blackboard' : 'one-light',
          // lineNumbers: true,
          // firstLineNumber: 1,
          scrollbarStyle: "null",
          viewportMargin: Infinity,
          lineWrapping: false,
          smartIndent: true,
          extraKeys: {
            'Shift-Tab': 'indentLess',
          },
          readOnly: readOnly || (canDrop && isOverCurrent),
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
              SlateEditor.withoutNormalizing(slateEditor, () => {
                Transforms.delete(slateEditor, { at: path });
                Transforms.insertNodes(slateEditor, {
                  type: 'paragraph',
                  children: [{
                    type: 'formatted',
                    text: ''
                  }]
                }, {
                  at: path,
                  select: true
                });
              })
              codeBlockMap.delete(uuid);
            }
          }
          if (isHotkey('enter', event)) {
            // 所在最后一行，且最后一行为空行，删除最后一行，并且聚焦到下一行
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const lineCount = editor.lineCount();
            if (cursor.line === lineCount - 1 && line === '') {
              event.preventDefault();
              // 只处理超过一行的情况
              if (lineCount !== 1)  {
                const doc = editor.getDoc();
                const previousLine = cursor.line - 1;
                const previousLineLength = doc.getLine(previousLine).length;
                const from = { line: previousLine, ch: previousLineLength };
                const to = { line: cursor.line, ch: cursor.ch };
                doc.replaceRange('', from, to);
                doc.setCursor({ line: previousLine, ch: previousLineLength });
                if (addParagraphRef.current) {
                  addParagraphRef.current.addParagraph();
                }
              }
            }
          }
        }}
      />
      <AddParagraph element={element} ref={addParagraphRef} />
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default CodeBlock;
