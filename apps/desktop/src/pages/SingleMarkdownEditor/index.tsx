import { useEffect, useRef, useState } from "react";
import {
  Descendant,
  Transforms,
  Editor as SlateEditor,
  Text,
  Element as SlateElement,
} from "slate";
import { ReactEditor } from "slate-react";
import { useSearchParams } from "react-router-dom";
import { message, Button, Tooltip } from "antd";

import { Editor, EditorRef } from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";
import { Editor as CodeMirrorEditor, EditorChange } from "codemirror";
import isHotkey from "is-hotkey";

import { readTextFile, writeTextFile, getDirectoryName } from "@/commands";
import {
  useMemoizedFn,
  useRafInterval,
  useThrottleFn,
  useUnmount,
  useLocalStorageState,
} from "ahooks";
import { importFromMarkdown, getMarkdown } from "@/utils";
import { getMarkdownWithPositions } from "@/utils/markdown-helper";
import { PositionMapper } from "@/utils/positionMapper";
import { importFromMarkdownWithPositions } from "@/utils/markdown";
import { codeBlockMap } from "@tau/editor/src/extensions/code-block";
import MarkdownSourceEditor from "./MarkdownSourceEditor";
import { getContentLength } from "@/utils/helper";
import useTheme from "@/hooks/useTheme";
import useSettingStore from "@/stores/useSettingStore";
import {
  EditOutlined,
  EyeOutlined,
  CodeOutlined,
  FormOutlined,
  BgColorsOutlined,
  FolderOutlined,
  FileMarkdownOutlined,
} from "@ant-design/icons";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import FileTree from "./FileTree";
import { fileAttachmentExtension } from "@/editor-extensions";

import styles from "./index.module.less";
import classnames from "classnames";
import If from "@/components/If";

const customExtensions = [fileAttachmentExtension];

const SingleMarkdownEditor = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const encodedFilePath = searchParams.get("filePath") || "";
  const encodedRootPath = searchParams.get("rootPath") || "";

  // filePath 和 rootPath 互斥，filePath 优先
  const initialFilePath = encodedFilePath
    ? decodeURIComponent(encodedFilePath)
    : "";
  const initialRootPath = initialFilePath
    ? "" // 如果有 filePath，rootPath 从 filePath 推导
    : encodedRootPath
      ? decodeURIComponent(encodedRootPath)
      : "";

  const [currentFilePath, setCurrentFilePath] = useState(initialFilePath);
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [loading, setLoading] = useState(!!initialFilePath); // 只有当有文件路径时才显示加载状态
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState<Descendant[]>([]);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [fileTreeWidth, setFileTreeWidth] = useLocalStorageState<number>(
    "markdown-editor-file-tree-width",
    {
      defaultValue: 240,
    },
  );
  const { isDark } = useTheme();
  const { onDarkModeChange } = useSettingStore((state) => ({
    onDarkModeChange: state.onDarkModeChange,
  }));

  const editorRef = useRef<EditorRef>(null);
  const sourceEditorRef = useRef<CodeMirrorEditor | null>(null);
  const beforeSaveSourceText = useRef("");
  const currentSourceText = useRef("");
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const positionMapRef = useRef<PositionMapper | null>(null);
  const pendingSlateSelectionRef = useRef<{
    path: number[];
    offset: number;
  } | null>(null);
  const pendingSlateFocusRef = useRef(false);
  const pendingCodeBlockFocusRef = useRef<{
    path: number[];
    cursor: { line: number; ch: number };
  } | null>(null);
  const lastEditorFocusRef = useRef<{
    path: number[];
    offset: number;
  } | null>(null);

  const resetEditorValue = useMemoizedFn((nodes: Descendant[]) => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    editor.isResetValue = true;
    SlateEditor.withoutNormalizing(editor, () => {
      for (let i = editor.children.length - 1; i >= 0; i -= 1) {
        Transforms.removeNodes(editor, { at: [i] });
      }
      if (nodes.length > 0) {
        Transforms.insertNodes(editor, nodes, { at: [0] });
      }
    });
    editor.isResetValue = false;
  });

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  });

  // 自定义切换主题函数
  const toggleTheme = useMemoizedFn(() => {
    onDarkModeChange(!isDark);
  });

  const toggleMode = useMemoizedFn(async () => {
    if (isSourceMode) {
      // 从源码模式切换到编辑模式
      console.log("[Toggle Mode] 从源码切换到编辑器");
      try {
        const cursorPos = sourceEditorRef.current?.getCursor();
        console.log("[Toggle Mode] 源码光标位置:", cursorPos);
        const { content, positionMap } = importFromMarkdownWithPositions(
          currentSourceText.current,
        );
        console.log("[Toggle Mode] 解析得到的 content 长度:", content.length);
        setContent(content);
        resetEditorValue(content);
        positionMapRef.current = positionMap;

        const slatePos = cursorPos
          ? positionMap.markdownToSlate(cursorPos)
          : null;
        console.log("[Toggle Mode] 映射后的 Slate 位置:", slatePos);

        const codeBlockHint = cursorPos
          ? positionMap.getElementPropertyByMarkdown(cursorPos)
          : null;
        if (
          codeBlockHint?.mapping.elementType === "code-block" &&
          codeBlockHint.propertyName === "code" &&
          codeBlockHint.relativePos
        ) {
          pendingCodeBlockFocusRef.current = {
            path: codeBlockHint.mapping.slateElementPath,
            cursor: codeBlockHint.relativePos,
          };
          pendingSlateSelectionRef.current = {
            path: codeBlockHint.mapping.slateElementPath,
            offset: 0,
          };
        } else {
          pendingCodeBlockFocusRef.current = null;
          pendingSlateSelectionRef.current =
            slatePos ?? lastEditorFocusRef.current;
        }

        pendingSlateFocusRef.current = true;
        setIsSourceMode(false);
      } catch (error) {
        console.error("解析Markdown失败:", error);
      }
    } else {
      // 从编辑模式切换到源码模式
      const editor = editorRef.current?.getEditor();
      const selection = editor?.selection;
      lastEditorFocusRef.current = selection?.focus
        ? {
            path: [...selection.focus.path],
            offset: selection.focus.offset,
          }
        : null;

      // 使用带位置映射的序列化
      const { markdown, positionMap } = getMarkdownWithPositions(content);

      currentSourceText.current = markdown;
      positionMapRef.current = positionMap;

      if (!sourceEditorRef.current) {
        console.error("源码编辑器未初始化");
        return;
      }

      sourceEditorRef.current.setValue(markdown);

      // 应用光标位置映射（Slate → Markdown）
      if (selection && selection.focus && editor) {
        let mdPos = null;
        const codeBlockEntry = SlateEditor.above(editor, {
          at: selection.focus,
          match: (node) =>
            SlateElement.isElement(node) && node.type === "code-block",
        });
        if (codeBlockEntry) {
          const [codeBlockNode, codeBlockPath] = codeBlockEntry as any;
          const uuid = codeBlockNode?.uuid;
          const codeEditor = uuid ? codeBlockMap.get(uuid) : null;
          const mapping =
            positionMap.getElementMappingBySlatePath(codeBlockPath);
          const codeMapping = mapping?.propertyMappings?.code;
          if (codeEditor && codeMapping) {
            const cursor = codeEditor.getCursor();
            const line = codeMapping.mdStartLine + cursor.line;
            const chBase = codeMapping.mdStartCh;
            mdPos = { line, ch: chBase + cursor.ch };
          }
        }
        if (!mdPos) {
          mdPos = positionMap.slateToMarkdown(selection.focus);
        }

        if (mdPos) {
          setTimeout(() => {
            sourceEditorRef.current?.setCursor(mdPos);
            sourceEditorRef.current?.focus();
          }, 100);
        }
      }

      setTimeout(() => {
        if (!sourceEditorRef.current) return;
        sourceEditorRef.current.refresh();
      }, 150);
      setIsSourceMode(true);
    }
  });

  const resolveSlatePoint = (
    editor: ReturnType<EditorRef["getEditor"]>,
    point: { path: number[]; offset: number } | null,
  ) => {
    if (!point) {
      return null;
    }

    if (SlateEditor.hasPath(editor, point.path)) {
      try {
        const [node] = SlateEditor.node(editor, point.path);
        if (Text.isText(node)) {
          return {
            path: point.path,
            offset: Math.min(point.offset, node.text.length),
          };
        }
        if (SlateElement.isElement(node)) {
          return SlateEditor.start(editor, point.path);
        }
      } catch {
        return null;
      }
      return SlateEditor.start(editor, point.path);
    }

    for (let i = point.path.length - 1; i >= 0; i -= 1) {
      const basePath = point.path.slice(0, i);
      if (!SlateEditor.hasPath(editor, basePath)) {
        continue;
      }
      const [node] = SlateEditor.node(editor, basePath);
      if (Text.isText(node)) {
        return {
          path: basePath,
          offset: Math.min(point.offset, node.text.length),
        };
      }
      const children = (node as any).children;
      if (Array.isArray(children) && children.length > 0) {
        const desiredIndex =
          typeof point.path[i] === "number"
            ? point.path[i]
            : children.length - 1;
        const clampedIndex = Math.min(
          Math.max(desiredIndex, 0),
          children.length - 1,
        );
        const candidatePath = [...basePath, clampedIndex];
        if (SlateEditor.hasPath(editor, candidatePath)) {
          const [child] = SlateEditor.node(editor, candidatePath);
          if (Text.isText(child)) {
            return {
              path: candidatePath,
              offset: Math.min(point.offset, child.text.length),
            };
          }
          return SlateEditor.end(editor, candidatePath);
        }
        return SlateEditor.end(editor, basePath);
      }
      return SlateEditor.end(editor, basePath);
    }

    return null;
  };

  useEffect(() => {
    if (!isSourceMode && pendingSlateFocusRef.current) {
      console.log("[Focus Debug] 进入聚焦逻辑，延迟100ms执行");
      setTimeout(() => {
        if (!editorRef.current) {
          console.warn("[Focus Debug] editorRef.current 为空");
          pendingSlateFocusRef.current = false;
          return;
        }
        const editor = editorRef.current.getEditor();
        if (!editor) {
          console.warn("[Focus Debug] editor 为空");
          pendingSlateFocusRef.current = false;
          return;
        }
        console.log("[Focus Debug] 获取到编辑器实例，尝试设置光标");

        try {
          const codeBlockFocus = pendingCodeBlockFocusRef.current;
          if (codeBlockFocus) {
            const attemptFocus = (count: number) => {
              if (!SlateEditor.hasPath(editor, codeBlockFocus.path)) {
                pendingCodeBlockFocusRef.current = null;
                pendingSlateSelectionRef.current = null;
                pendingSlateFocusRef.current = false;
                return;
              }
              const [node] = SlateEditor.node(editor, codeBlockFocus.path);
              const uuid = (node as any)?.uuid;
              const codeEditor = uuid ? codeBlockMap.get(uuid) : null;
              if (!codeEditor) {
                if (count === 0) {
                  try {
                    Transforms.deselect(editor);
                  } catch {
                    // ignore
                  }
                }
                if (count < 12) {
                  setTimeout(() => attemptFocus(count + 1), 80);
                } else {
                  pendingCodeBlockFocusRef.current = null;
                  pendingSlateSelectionRef.current = null;
                  pendingSlateFocusRef.current = false;
                }
                return;
              }
              const line = Math.min(
                codeBlockFocus.cursor.line,
                codeEditor.lastLine(),
              );
              const lineText = codeEditor.getLine(line) || "";
              const ch = Math.min(codeBlockFocus.cursor.ch, lineText.length);
              codeEditor.focus();
              codeEditor.setCursor({ line, ch });
              pendingCodeBlockFocusRef.current = null;
              pendingSlateSelectionRef.current = null;
              pendingSlateFocusRef.current = false;
            };
            attemptFocus(0);
            return;
          }

          const target = resolveSlatePoint(
            editor,
            pendingSlateSelectionRef.current,
          );
          console.log("[Focus Debug] 目标位置:", target);
          if (target) {
            Transforms.select(editor, { anchor: target, focus: target });
          }
          ReactEditor.focus(editor);
          console.log("[Focus Debug] 聚焦成功");
        } catch (e) {
          console.error("[Focus Debug] 设置光标失败，不进行聚焦:", e);
        } finally {
          pendingSlateSelectionRef.current = null;
          pendingSlateFocusRef.current = false;
        }
      }, 100);
    }
  }, [isSourceMode, content]);

  // 使用节流函数计算字数，每秒最多计算一次
  const { run: calculateWordCount } = useThrottleFn(
    () => {
      if (isSourceMode) {
        const editorContent = importFromMarkdown(currentSourceText.current);
        setWordCount(getContentLength(editorContent));
      } else {
        setWordCount(getContentLength(content));
      }
    },
    { wait: 1000 },
  );

  const saveMarkdownFile = useMemoizedFn(async (filePathToSave?: string) => {
    const pathToSave = filePathToSave || currentFilePath;
    if (!pathToSave) return;

    try {
      const markdownText = isSourceMode
        ? currentSourceText.current
        : getMarkdown(content);
      if (markdownText === beforeSaveSourceText.current) return;
      beforeSaveSourceText.current = markdownText;
      currentSourceText.current = markdownText;
      await writeTextFile(pathToSave, markdownText);
    } catch (error) {
      console.error("保存Markdown文件失败:", error);
      message.error("保存失败");
    }
  });

  const onSourceEditorDidMount = useMemoizedFn((editor: CodeMirrorEditor) => {
    sourceEditorRef.current = editor;
  });

  const syncSearchParamsWithFilePath = useMemoizedFn((nextFilePath: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextFilePath) {
      params.set("filePath", encodeURIComponent(nextFilePath));
    } else {
      params.delete("filePath");
    }
    setSearchParams(params, { replace: true });
  });

  const loadMarkdownFile = useMemoizedFn(async (filePathToLoad: string) => {
    try {
      const markdownText = await readTextFile(filePathToLoad);
      const editorContent = importFromMarkdown(markdownText);
      setContent(editorContent);
      currentSourceText.current = markdownText;
      beforeSaveSourceText.current = markdownText;

      // 更新编辑器的内容
      if (editorRef.current) {
        editorRef.current.setEditorValue(editorContent);
      }

      // 更新源码编辑器的内容（如果在源码模式）
      if (isSourceMode && sourceEditorRef.current) {
        sourceEditorRef.current.setValue(markdownText);
      }

      // editorRef.current?.focus();
      calculateWordCount();

      // 滚动到顶部
      setTimeout(() => {
        editorContainerRef.current?.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }, 100);
    } catch (error) {
      console.error("加载Markdown文件失败:", error);
      message.error("加载文件失败");
      setError(error instanceof Error ? error.message : "未知错误");
    }
  });

  const onFileClick = useMemoizedFn(async (newFilePath: string) => {
    if (newFilePath === currentFilePath) return;

    // 自动保存当前文件
    await saveMarkdownFile(currentFilePath);

    // 切换到新文件
    setCurrentFilePath(newFilePath);
    syncSearchParamsWithFilePath(newFilePath);
    await loadMarkdownFile(newFilePath);
  });

  useEffect(() => {
    // 监听键盘快捷键
    const handleKeyDown = (event: KeyboardEvent) => {
      // 保存: Ctrl+S 或 Command+S
      if (isHotkey("mod+s", event)) {
        event.preventDefault();
        saveMarkdownFile();
      }

      // 切换模式: Ctrl+/ 或 Command+/
      if (isHotkey("mod+/", event)) {
        event.preventDefault();
        toggleMode();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveMarkdownFile, toggleMode]);

  useEffect(() => {
    const init = async () => {
      if (initialFilePath) {
        // 有文件路径，加载文件并设置 rootPath
        await loadMarkdownFile(initialFilePath);
        const dirPath = await getDirectoryName(initialFilePath);
        setRootPath(dirPath);
      } else if (initialRootPath) {
        // 只有 rootPath，不加载文件
        setRootPath(initialRootPath);
      }
    };

    init().finally(() => {
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    calculateWordCount();
  }, [content, calculateWordCount]);

  // 每隔3秒自动保存
  useRafInterval(() => {
    if (error) return;
    saveMarkdownFile();
  }, 500);

  // 窗口关闭时保存
  useUnmount(() => {
    saveMarkdownFile();
  });

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    setContent(value);
  });

  const onSourceTextChange = useMemoizedFn(
    (_editor: CodeMirrorEditor, _change: EditorChange, code: string) => {
      currentSourceText.current = code;
      calculateWordCount();
    },
  );

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!rootPath && !currentFilePath) {
    return <div className={styles.loading}>未指定文件路径或文件夹</div>;
  }

  return (
    <div
      className={classnames(styles.singleMarkdownEditorContainer, {
        [styles.dark]: isDark,
      })}
    >
      <div className={styles.mainContent}>
        <ResizableAndHideableSidebar
          width={fileTreeWidth ?? 240}
          open={fileTreeOpen}
          onWidthChange={(width) => setFileTreeWidth(width)}
          className={styles.fileTreeSidebar}
          minWidth={200}
          maxWidth={400}
          side="right"
        >
          <div className={styles.fileTreeContainer}>
            {rootPath && (
              <FileTree
                currentFilePath={currentFilePath}
                onFileClick={onFileClick}
                rootPath={rootPath}
              />
            )}
          </div>
        </ResizableAndHideableSidebar>

        <div className={styles.editorContainer} ref={editorContainerRef}>
          {currentFilePath ? (
            <>
              <div
                className={classnames(styles.sourceEditor, {
                  [styles.hidden]: !isSourceMode,
                })}
              >
                <MarkdownSourceEditor
                  value={currentSourceText.current}
                  onChange={onSourceTextChange}
                  editorDidMount={onSourceEditorDidMount}
                  isDark={isDark}
                  readonly={isReadonly}
                />
              </div>
              <If condition={!isSourceMode}>
                <div className={styles.contentEditor}>
                  <ErrorBoundary>
                    <Editor
                      key={currentFilePath}
                      className={styles.editor}
                      ref={editorRef}
                      initValue={content}
                      onChange={onContentChange}
                      readonly={isReadonly}
                      theme={isDark ? "dark" : "light"}
                      extensions={customExtensions}
                    />
                  </ErrorBoundary>
                  <div className={styles.outlineContainer}>
                    <EditorOutline
                      className={styles.outline}
                      content={content}
                      show={true}
                      onClickHeader={onClickHeader}
                    />
                  </div>
                </div>
              </If>
            </>
          ) : (
            <div className={styles.emptyEditor}>
              <div className={styles.emptyContent}>
                <FileMarkdownOutlined style={{ fontSize: 64, color: "#999" }} />
                <p>请从左侧文件树选择一个 Markdown 文件</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
          <Tooltip title={fileTreeOpen ? "隐藏文件树" : "显示文件树"}>
            <Button
              type="text"
              icon={<FolderOutlined />}
              onClick={() => setFileTreeOpen(!fileTreeOpen)}
            />
          </Tooltip>

          <Tooltip title={isReadonly ? "切换到编辑模式" : "切换到只读模式"}>
            <Button
              type="text"
              icon={isReadonly ? <EditOutlined /> : <EyeOutlined />}
              onClick={() => setIsReadonly(!isReadonly)}
            />
          </Tooltip>

          <Tooltip title={isDark ? "切换到浅色模式" : "切换到深色模式"}>
            <Button
              type="text"
              icon={<BgColorsOutlined />}
              onClick={toggleTheme}
            />
          </Tooltip>

          <Tooltip title={isSourceMode ? "切换到编辑模式" : "切换到源码模式"}>
            <Button
              type="text"
              icon={isSourceMode ? <FormOutlined /> : <CodeOutlined />}
              onClick={toggleMode}
            />
          </Tooltip>
        </div>

        <div className={styles.statusBarRight}>
          <span className={styles.wordCount}>{wordCount} 字</span>
        </div>
      </div>
    </div>
  );
};

export default SingleMarkdownEditor;
