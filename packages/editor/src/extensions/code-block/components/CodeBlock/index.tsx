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
  useSlateStatic,
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
import { PortalToBody } from "@tau/shared";
import type { CodeBlockElement } from "../../../types";
import AddParagraph, {
  AddParagraphRef,
} from "../../../../components/AddParagraph";
import useTheme from "../../../../hooks/useTheme";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import SelectLanguage from "../SelectLanguage";
import ToolbarButtons from "./ToolbarButtons";
import DragHandle from "./DragHandle";
import { LANGUAGES } from "./config";
import { codeBlockMap, codeBlockActionsMap } from "../../index";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { buildCodeBlockMenuItems } from "../../utils/menuItems";

import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import {
  registerBlockNavigation,
  unregisterBlockNavigation,
  focusPreviousBlock,
  focusNextBlock,
} from "../../../../utils";
import "./codemirror.less";

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
    isFold = false,
    foldHeight = 400,
  } = element;
  const [code, setCode] = useState(defaultCode);
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
  const slateEditor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const fullscreenEditorRef = useRef<Editor | null>(null);
  const pendingLocalCodeRef = useRef<string | null>(null);
  const { message } = App.useApp();
  const resizeStartYRef = useRef(0);
  const startFoldHeightRef = useRef(0);
  const isLast = useIsLastElement(element);
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor: slateEditor,
    buildMenuItems: (params) => buildCodeBlockMenuItems(params, message),
  });

  useEffect(() => {
    const nextCode = defaultCode || "";
    if (pendingLocalCodeRef.current === nextCode) {
      pendingLocalCodeRef.current = null;
      return;
    }
    pendingLocalCodeRef.current = null;
    setCode(nextCode);
    if (editorRef.current && editorRef.current.getValue() !== nextCode) {
      editorRef.current.setValue(nextCode);
      editorRef.current.refresh();
    }
    if (
      fullscreenEditorRef.current &&
      fullscreenEditorRef.current.getValue() !== nextCode
    ) {
      fullscreenEditorRef.current.setValue(nextCode);
      fullscreenEditorRef.current.refresh();
    }
  }, [defaultCode]);

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
      Transforms.setNodes(slateEditor, { isFold: false }, { at: path });
    }
  });

  const updateFoldHeight = useMemoizedFn((nextHeight: number) => {
    const path = ReactEditor.findPath(slateEditor, element);
    Transforms.setNodes(slateEditor, { foldHeight: nextHeight }, { at: path });
    measureFoldable();
  });

  const handleOnChange = useMemoizedFn(
    (_editor: Editor, _change: EditorChange, value: string) => {
      pendingLocalCodeRef.current = value;
      const path = ReactEditor.findPath(slateEditor, element);
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

  // Register actions for menu access
  useEffect(() => {
    codeBlockActionsMap.set(uuid, {
      toggleFullscreen,
      canFold,
    });
    return () => {
      codeBlockActionsMap.delete(uuid);
    };
  }, [uuid, toggleFullscreen, canFold]);

  useEffect(() => {
    const scrollIntoView = () => {
      try {
        const dom = ReactEditor.toDOMNode(slateEditor, element);
        dom.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } catch (e) {
        // ignore
      }
    };

    const focusCodeMirror = (toEnd: boolean) => {
      const editorInstance = codeBlockMap.get(uuid);
      if (!editorInstance) {
        return false;
      }
      scrollIntoView();
      const doc = editorInstance.getDoc();
      const targetLine = toEnd ? doc.lastLine() : doc.firstLine();
      const targetLength = doc.getLine(targetLine)?.length || 0;
      editorInstance.focus();
      doc.setCursor({
        line: targetLine,
        ch: toEnd ? targetLength : 0,
      });
      return true;
    };

    registerBlockNavigation(element, {
      focusStart: () => focusCodeMirror(false),
      focusEnd: () => focusCodeMirror(true),
    });

    return () => {
      unregisterBlockNavigation(element);
    };
  }, [element, uuid]);

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
      const tryFocusOuterBlock = (
        direction: "backward" | "forward",
        metaReason: "arrow",
      ) => {
        const path = ReactEditor.findPath(slateEditor, element);
        const meta = {
          reason: metaReason,
          direction,
        } as const;
        return direction === "backward"
          ? focusPreviousBlock(slateEditor, path, meta)
          : focusNextBlock(slateEditor, path, meta);
      };

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
      if (!isFullscreen && isHotkey("up", event)) {
        const cursor = editor.getCursor();
        if (cursor.line === 0 && cursor.ch === 0) {
          const focused = tryFocusOuterBlock("backward", "arrow");
          if (focused) {
            event.preventDefault();
            return;
          }
        }
      }
      if (!isFullscreen && isHotkey("down", event)) {
        const cursor = editor.getCursor();
        const lastLine = editor.lastLine();
        const lastLineText = editor.getLine(lastLine) || "";
        if (cursor.line === lastLine && cursor.ch === lastLineText.length) {
          const focused = tryFocusOuterBlock("forward", "arrow");
          if (focused) {
            event.preventDefault();
            return;
          }
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
      ref={(node) => {
        drop(node);
      }}
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
        {!(readOnly && isLast) && (
          <AddParagraph element={element} ref={addParagraphRef} />
        )}
        <DragHandle
          canDrag={canDrag}
          dragRef={drag}
          onClick={dragHandlerProps.onClick}
        />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
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
