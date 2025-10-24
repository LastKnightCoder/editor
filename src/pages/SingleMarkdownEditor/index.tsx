import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";
import { message, Button, Tooltip } from "antd";

import Editor, { EditorRef } from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";
import { Editor as CodeMirrorEditor, EditorChange } from "codemirror";
import isHotkey from "is-hotkey";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { readTextFile, writeTextFile, getDirectoryName } from "@/commands";
import {
  useMemoizedFn,
  useRafInterval,
  useThrottleFn,
  useUnmount,
  useLocalStorageState,
} from "ahooks";
import { importFromMarkdown, getMarkdown } from "@/utils";
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

import styles from "./index.module.less";
import classnames from "classnames";
import If from "@/components/If";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

const SingleMarkdownEditor = () => {
  const [searchParams] = useSearchParams();
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
  const sourceEditorRef = useRef<CodeMirrorEditor>();
  const uploadResource = useUploadResource();
  const beforeSaveSourceText = useRef("");
  const currentSourceText = useRef("");
  const editorContainerRef = useRef<HTMLDivElement>(null);

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
      try {
        const editorContent = importFromMarkdown(currentSourceText.current);
        setContent(editorContent);
        editorRef.current?.setEditorValue(editorContent);
      } catch (error) {
        console.error("解析Markdown失败:", error);
      }
    } else {
      // 从编辑模式切换到源码模式
      const markdownText = getMarkdown(content);
      currentSourceText.current = markdownText;
      if (!sourceEditorRef.current) {
        console.error("源码编辑器未初始化");
        return;
      }
      sourceEditorRef.current.setValue(markdownText);
      setTimeout(() => {
        if (!sourceEditorRef.current) return;
        sourceEditorRef.current.refresh();
      }, 100);
    }
    setIsSourceMode(!isSourceMode);
  });

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
                      extensions={customExtensions}
                      readonly={isReadonly}
                      uploadResource={uploadResource}
                      theme={isDark ? "dark" : "light"}
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
