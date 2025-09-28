import React, {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  useMemo,
} from "react";
import { Transforms, Editor as SlateEditor } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
} from "slate-react";
import classnames from "classnames";
import { Editor, EditorChange, EditorConfiguration } from "codemirror";
import { App } from "antd";
import isHotkey from "is-hotkey";
import {
  MdFullscreenExit,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
} from "react-icons/md";
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

const MIN_FOLD_HEIGHT = 200;
const MAX_FOLD_HEIGHT = 1200;

const CodeBlock: React.FC<React.PropsWithChildren<ICodeBlockProps>> = (
  props,
) => {
  const { children, element, onDidMount, onWillUnmount, attributes } = props;
  const {
    code: defaultCode,
    language,
    uuid,
    isFold: defaultIsFold = false,
    foldHeight: defaultFoldHeight = 400,
  } = element;
  const [code, setCode] = useState(defaultCode);
  const [isFold, setIsFold] = useState<boolean>(defaultIsFold);
  const [foldHeight, setFoldHeight] = useState<number>(defaultFoldHeight);
  const [canFold, setCanFold] = useState(false);
  const [langConfig, setLangConfig] = useState<ILanguageConfig>();
  const foldStyle = useMemo(() => {
    if (!(isFold && canFold)) {
      return undefined;
    }
    return {
      "--fold-height": `${foldHeight / 16}em`,
    } as React.CSSProperties;
  }, [canFold, foldHeight, isFold]);
  const slateEditor = useSlate();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const fullscreenEditorRef = useRef<Editor | null>(null);
  const { message } = App.useApp();
  const resizeStartYRef = useRef(0);
  const startFoldHeightRef = useRef(0);

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  useEffect(() => {
    const path = ReactEditor.findPath(slateEditor, element);
    if (typeof element.isFold !== "boolean") {
      Transforms.setNodes(slateEditor, { isFold: false }, { at: path });
    }
    if (typeof element.foldHeight !== "number") {
      Transforms.setNodes(
        slateEditor,
        { foldHeight: MIN_FOLD_HEIGHT },
        { at: path },
      );
    }
  }, [element, slateEditor]);

  useEffect(() => {
    setIsFold(defaultIsFold);
  }, [defaultIsFold]);

  useEffect(() => {
    setFoldHeight(defaultFoldHeight);
  }, [defaultFoldHeight]);

  useEffect(() => {
    const alias =
      aliases[language?.toLowerCase() as keyof typeof aliases] || language;
    const languageConfig = LANGUAGES.find(
      (lang) => lang.name.toLowerCase() === alias?.toLowerCase(),
    );
    if (!languageConfig) {
      return;
    }
    setLangConfig(languageConfig);
  }, [language]);

  const measureFoldable = useMemoizedFn(() => {
    if (isFullscreen) {
      return;
    }
    const wrapper = editorRef.current?.getWrapperElement();
    if (!wrapper) {
      setCanFold(false);
      return;
    }
    const scrollHeight = wrapper.scrollHeight;
    const threshold = Math.max(foldHeight, MIN_FOLD_HEIGHT);
    const foldable = scrollHeight > threshold;
    setCanFold(foldable);
    if (!foldable && isFold) {
      const path = ReactEditor.findPath(slateEditor, element);
      setIsFold(false);
      Transforms.setNodes(slateEditor, { isFold: false }, { at: path });
    }
  });

  const updateFoldHeight = useMemoizedFn((nextHeight: number) => {
    setFoldHeight(nextHeight);
    const path = ReactEditor.findPath(slateEditor, element);
    Transforms.setNodes(slateEditor, { foldHeight: nextHeight }, { at: path });
    measureFoldable();
  });

  useEffect(() => {
    setCode(defaultCode);
    measureFoldable();
  }, [defaultCode, measureFoldable]);

  const handleOnChange = useMemoizedFn(
    (_editor: Editor, _change: EditorChange, value: string) => {
      const path = ReactEditor.findPath(slateEditor, element);
      setCode(value);
      Transforms.setNodes(slateEditor, { code: value }, { at: path });
      measureFoldable();
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
    if (!isFullscreen) {
      setTimeout(() => {
        measureFoldable();
      }, 100);
    }
  });

  const handleOnLanguageChange = useMemoizedFn((value: string) => {
    Transforms.setNodes(
      slateEditor,
      { language: value },
      { at: ReactEditor.findPath(slateEditor, element) },
    );
  });

  const handleToggleFold = useMemoizedFn(() => {
    const path = ReactEditor.findPath(slateEditor, element);
    const nextIsFold = !isFold;
    setIsFold(nextIsFold);
    Transforms.setNodes(slateEditor, { isFold: nextIsFold }, { at: path });
    if (!nextIsFold) {
      measureFoldable();
    }
  });

  const handleResizeMove = useMemoizedFn((event: MouseEvent) => {
    const deltaY = event.clientY - resizeStartYRef.current;
    const nextHeight = Math.min(
      MAX_FOLD_HEIGHT,
      Math.max(MIN_FOLD_HEIGHT, startFoldHeightRef.current + deltaY),
    );
    updateFoldHeight(nextHeight);
  });

  const handleResizeEnd = useMemoizedFn(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  const handleResizeStart = useMemoizedFn(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isFold || readOnly) {
        return;
      }
      event.preventDefault();
      resizeStartYRef.current = event.clientY;
      startFoldHeightRef.current = foldHeight;
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    },
  );

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
        // 所在最后一行，且最后一行和前一行为空行，删除最后两行，并且创建下一个段落
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const lineCount = editor.lineCount();
        if (cursor.line === lineCount - 1 && line === "" && lineCount > 2) {
          const prevLine = editor.getLine(cursor.line - 1);
          // 只处理超过一行的情况
          if (prevLine === "") {
            event.preventDefault();
            const doc = editor.getDoc();
            const prepreLine = cursor.line - 2;
            const prepreLineLength = doc.getLine(prepreLine).length;
            const from = { line: prepreLine, ch: prepreLineLength };
            const to = { line: cursor.line, ch: cursor.ch };
            doc.replaceRange("", from, to);
            doc.setCursor({ line: prepreLine, ch: prepreLineLength });
            if (addParagraphRef.current) {
              addParagraphRef.current.addParagraph();
            }
          }
        }
      }
    },
  );

  const editorOptions = useMemo(() => {
    return {
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
    } as EditorConfiguration;
  }, [langConfig, isDark, readOnly, canDrop, isOverCurrent]);

  const onEditorDidMount = useMemoizedFn((editor: Editor) => {
    editorRef.current = editor;
    setTimeout(() => {
      measureFoldable();
    }, 0);
    onDidMount && onDidMount(editor);
  });

  const onEditorWillUnmount = useMemoizedFn((editor: Editor) => {
    onWillUnmount && onWillUnmount(editor);
    editorRef.current = null;
  });

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeEnd, handleResizeMove]);

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
          <div
            className={classnames(styles.CodeMirrorContainer, {
              [styles.folded]: isFold && canFold,
            })}
            style={foldStyle}
          >
            <CodeEditorLazy
              value={code || ""}
              options={editorOptions}
              onChange={handleOnChange}
              onKeyDown={handleOnKeyDown}
              editorDidMount={onEditorDidMount}
              editorWillUnmount={onEditorWillUnmount}
            />
            {canFold && (
              <div className={styles.foldToggle} onClick={handleToggleFold}>
                {isFold ? (
                  <MdKeyboardArrowDown size={18} />
                ) : (
                  <MdKeyboardArrowUp size={18} />
                )}
              </div>
            )}
            {isFold && canFold && !readOnly && (
              <div
                className={styles.resizeHandle}
                onMouseDown={handleResizeStart}
              >
                <div className={styles.resizeIndicator} />
              </div>
            )}
          </div>
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
