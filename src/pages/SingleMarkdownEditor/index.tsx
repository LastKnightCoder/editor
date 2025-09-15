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
import { readTextFile, writeTextFile } from "@/commands";
import {
  useMemoizedFn,
  useRafInterval,
  useThrottleFn,
  useUnmount,
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
} from "@ant-design/icons";

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
  const filePath = decodeURIComponent(encodedFilePath);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState<Descendant[]>([]);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const { isDark } = useTheme();
  const { onDarkModeChange } = useSettingStore((state) => ({
    onDarkModeChange: state.onDarkModeChange,
  }));

  const editorRef = useRef<EditorRef>(null);
  const sourceEditorRef = useRef<CodeMirrorEditor>();
  const uploadResource = useUploadResource();
  const beforeSaveSourceText = useRef("");
  const currentSourceText = useRef("");

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
        editorRef.current?.focus();
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
        sourceEditorRef.current.focus();
        // 去最后一行最后一列
        const doc = sourceEditorRef.current.getDoc();
        const lastLine = doc.lineCount() - 1;
        const lastLineLength = doc.getLine(lastLine).length;
        doc.setCursor({ line: lastLine, ch: lastLineLength });
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

  const saveMarkdownFile = useMemoizedFn(async () => {
    if (!filePath) return;

    try {
      const markdownText = isSourceMode
        ? currentSourceText.current
        : getMarkdown(content);
      if (markdownText === beforeSaveSourceText.current) return;
      beforeSaveSourceText.current = markdownText;
      currentSourceText.current = markdownText;
      await writeTextFile(filePath, markdownText);
    } catch (error) {
      console.error("保存Markdown文件失败:", error);
      message.error("保存失败");
    }
  });

  const onSourceEditorDidMount = useMemoizedFn((editor: CodeMirrorEditor) => {
    sourceEditorRef.current = editor;
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
    if (!filePath) {
      setLoading(false);
      return;
    }

    const loadMarkdownFile = async () => {
      try {
        const markdownText = await readTextFile(filePath);
        const editorContent = importFromMarkdown(markdownText);
        setContent(editorContent);
        currentSourceText.current = markdownText;
        beforeSaveSourceText.current = markdownText;
        editorRef.current?.focus();
        calculateWordCount();
      } catch (error) {
        console.error("加载Markdown文件失败:", error);
        message.error("加载文件失败");
        setError(error instanceof Error ? error.message : "未知错误");
      }
    };

    loadMarkdownFile().finally(() => {
      setLoading(false);
    });
  }, [calculateWordCount, filePath]);

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

  if (!filePath) {
    return <div className={styles.loading}>未指定文件路径</div>;
  }

  return (
    <div
      className={classnames(styles.singleMarkdownEditorContainer, {
        [styles.dark]: isDark,
      })}
    >
      <div className={styles.editorContainer}>
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
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
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
