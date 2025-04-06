import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Transforms, Editor as SlateEditor } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
} from "slate-react";
import classnames from "classnames";
import { Editor, EditorChange } from "codemirror";
import { message } from "antd";
import isHotkey from "is-hotkey";
import { MdFullscreenExit } from "react-icons/md";
import { CodeBlockElement } from "@/components/Editor/types";
import AddParagraph, {
  AddParagraphRef,
} from "@/components/Editor/components/AddParagraph";
import useTheme from "../../../../hooks/useTheme";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import SelectLanguage from "../SelectLanguage";
import ToolbarButtons from "./ToolbarButtons";
import DragHandle from "./DragHandle";
import { LANGUAGES } from "./config";
import { codeBlockMap } from "../../index";

import styles from "./index.module.less";
import PortalToBody from "@/components/PortalToBody";
import { useMemoizedFn } from "ahooks";

// 懒加载CodeMirror编辑器组件
const CodeEditorLazy = lazy(() => import("./CodeEditor"));
const FullscreenCodeEditorLazy = lazy(() => import("./FullscreenCodeEditor"));

interface ICodeBlockProps {
  attributes: RenderElementProps["attributes"];
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
  js: "javascript",
  ts: "typescript",
  rs: "rust",
  py: "python",
  md: "markdown",
  xml: "html/xml",
  latex: "stex",
  cpp: "C++",
  sh: "shell",
  zsh: "shell",
};

const CodeBlock: React.FC<React.PropsWithChildren<ICodeBlockProps>> = (
  props,
) => {
  const { onChange, children, element, onDidMount, onWillUnmount, attributes } =
    props;
  const { code: defaultCode, language, uuid } = element;
  const [code, setCode] = useState(defaultCode);
  const [langConfig, setLangConfig] = useState<ILanguageConfig>();
  const slateEditor = useSlate();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const fullscreenEditorRef = useRef<Editor | null>(null);

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  useEffect(() => {
    // @ts-ignore
    const alias: string = aliases[language] || language;
    const languageConfig = LANGUAGES.find(
      (lang) => lang.name.toLowerCase() === alias.toLowerCase(),
    );
    if (!languageConfig) {
      return;
    }
    setLangConfig(languageConfig);
  }, [language]);

  const handleOnChange = useMemoizedFn(
    (_editor: Editor, _change: EditorChange, code: string) => {
      const path = ReactEditor.findPath(slateEditor, element);
      Transforms.setNodes(slateEditor, { code }, { at: path });
      onChange && onChange(code);
    },
  );

  const handleCopyCode = useMemoizedFn(async () => {
    const editor = codeBlockMap.get(uuid);
    if (navigator.clipboard && editor) {
      const code = editor.getValue();
      await navigator.clipboard.writeText(code);
      await message.success("复制代码成功");
    } else {
      await message.error("复制代码失败");
    }
  });

  const toggleFullscreen = useMemoizedFn(() => {
    if (!isFullscreen) {
      const code = editorRef.current?.getValue() || "";
      setCode(code);
      setTimeout(() => {
        if (fullscreenEditorRef.current) {
          fullscreenEditorRef.current.setValue(code);
          fullscreenEditorRef.current.refresh();
          fullscreenEditorRef.current.focus();
          // 去最后一行最后一列
          const doc = fullscreenEditorRef.current.getDoc();
          const lastLine = doc.lineCount() - 1;
          const lastLineLength = doc.getLine(lastLine).length;
          doc.setCursor({ line: lastLine, ch: lastLineLength });
        }
      }, 50);
    } else {
      const code = fullscreenEditorRef.current?.getValue() || "";
      setCode(code);
      if (editorRef.current) {
        editorRef.current.setValue(code);
        editorRef.current.refresh();
        editorRef.current.focus();
        // 去最后一行最后一列
        const doc = editorRef.current.getDoc();
        const lastLine = doc.lineCount() - 1;
        const lastLineLength = doc.getLine(lastLine).length;
        doc.setCursor({ line: lastLine, ch: lastLineLength });
      }
    }
    setIsFullscreen(!isFullscreen);
  });

  const handleOnLanguageChange = useMemoizedFn((value: string) => {
    Transforms.setNodes(
      slateEditor,
      { language: value },
      { at: ReactEditor.findPath(slateEditor, element) },
    );
  });

  const handleOnKeyDown = useMemoizedFn(
    (editor: Editor, event: KeyboardEvent) => {
      if (isHotkey(["delete", "backspace"], event)) {
        if (editor.getValue() === "") {
          event.preventDefault();
          const path = ReactEditor.findPath(slateEditor, element);
          SlateEditor.withoutNormalizing(slateEditor, () => {
            Transforms.delete(slateEditor, { at: path });
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
                select: true,
              },
            );
          });
          codeBlockMap.delete(uuid);
        }
      }
      if (isHotkey("enter", event) && !isFullscreen) {
        // 所在最后一行，且最后一行为空行，删除最后一行，并且聚焦到下一行
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const lineCount = editor.lineCount();
        if (cursor.line === lineCount - 1 && line === "") {
          event.preventDefault();
          // 只处理超过一行的情况
          if (lineCount !== 1) {
            const doc = editor.getDoc();
            const previousLine = cursor.line - 1;
            const previousLineLength = doc.getLine(previousLine).length;
            const from = { line: previousLine, ch: previousLineLength };
            const to = { line: cursor.line, ch: cursor.ch };
            doc.replaceRange("", from, to);
            doc.setCursor({ line: previousLine, ch: previousLineLength });
            if (addParagraphRef.current) {
              addParagraphRef.current.addParagraph();
            }
          }
        }
      }
    },
  );

  const editorOptions = {
    inputStyle: "textarea",
    mode: langConfig?.mime || langConfig?.mode || "text/plain",
    theme: isDark ? "blackboard" : "one-light",
    scrollbarStyle: "null",
    viewportMargin: Infinity,
    lineWrapping: false,
    smartIndent: true,
    extraKeys: {
      "Shift-Tab": "indentLess",
    },
    readOnly: readOnly || (canDrop && isOverCurrent),
    indentUnit: 2,
    tabSize: 2,
    cursorHeight: 1,
    autoCloseBrackets: true,
    tabindex: -1,
  };

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
      <div {...attributes}>
        {children}
        <ToolbarButtons
          onCopy={handleCopyCode}
          onFullscreen={toggleFullscreen}
        />
        <SelectLanguage
          readonly={readOnly}
          className={styles.languageSelect}
          value={language}
          onChange={handleOnLanguageChange}
        />
        <Suspense
          fallback={<div className={styles.loading}>加载代码编辑器中...</div>}
        >
          <CodeEditorLazy
            value={code || ""}
            options={editorOptions}
            className={styles.CodeMirrorContainer}
            onChange={handleOnChange}
            onKeyDown={handleOnKeyDown}
            editorDidMount={(editor: Editor) => {
              editorRef.current = editor;
              onDidMount && onDidMount(editor);
            }}
            editorWillUnmount={(editor: Editor) => {
              onWillUnmount && onWillUnmount(editor);
              editorRef.current = null;
            }}
          />
        </Suspense>
        <AddParagraph element={element} ref={addParagraphRef} />
        <DragHandle canDrag={canDrag} dragRef={drag} />
        {isFullscreen && (
          <PortalToBody>
            <div
              className={classnames(styles.fullscreenOverlay, {
                [styles.darkOverlay]: isDark,
              })}
              onClick={() => setIsFullscreen(false)}
            >
              <div
                className={classnames(styles.fullscreenContent, {
                  [styles.dark]: isDark,
                })}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.fullscreenHeader}>
                  <SelectLanguage
                    readonly={readOnly}
                    className={styles.fullscreenLanguageSelect}
                    value={language}
                    onChange={handleOnLanguageChange}
                  />
                  <div
                    className={styles.closeButton}
                    onClick={toggleFullscreen}
                  >
                    <MdFullscreenExit size={20} />
                  </div>
                </div>
                <Suspense
                  fallback={
                    <div className={styles.loading}>加载全屏编辑器中...</div>
                  }
                >
                  <FullscreenCodeEditorLazy
                    value={code || ""}
                    options={editorOptions}
                    className={styles.fullscreenCodeMirror}
                    onChange={handleOnChange}
                    onKeyDown={handleOnKeyDown}
                    editorDidMount={(editor: Editor) => {
                      fullscreenEditorRef.current = editor;
                      if (!readOnly) {
                        setTimeout(() => {
                          editor.refresh();
                          editor.focus();
                        }, 50);
                      }
                    }}
                    editorWillUnmount={() => {
                      fullscreenEditorRef.current = null;
                    }}
                  />
                </Suspense>
              </div>
            </div>
          </PortalToBody>
        )}
      </div>
    </div>
  );
};

export default React.memo(CodeBlock);
