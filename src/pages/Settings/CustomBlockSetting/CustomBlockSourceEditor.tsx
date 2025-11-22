import { useState, useRef, useEffect } from "react";
import { message } from "antd";
import {
  MdArrowBack,
  MdSave,
  MdCode,
  MdRefresh,
  MdSmartphone,
  MdLaptop,
} from "react-icons/md";
import { UnControlled as CodeEditor } from "react-codemirror2";
import { Editor } from "codemirror";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";
import { updateCustomBlockSource } from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import { compileAndExecuteCustomBlock } from "@/components/Editor";
import ResizablePanel from "@/components/ResizablePanel";
import "codemirror/mode/jsx/jsx";
import styles from "./CustomBlockSourceEditor.module.less";

interface CustomBlockSourceEditorProps {
  block: ICustomBlock;
  onBack: () => void;
}

// 复用 CustomBlock 组件的渲染逻辑
const CustomBlockPreview = ({ content }: { content: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    if (!ref.current || !content) return;

    let cleanup: (() => void) | undefined;

    compileAndExecuteCustomBlock(content, isDark, ref.current, {
      useTheme,
    }).then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      cleanup?.();
    };
  }, [content, isDark]);

  return <div ref={ref}></div>;
};

// 编辑器面板
const EditorPane = ({
  source,
  isDark,
  editorRef,
  onContentChange,
}: {
  source: string;
  isDark: boolean;
  editorRef: React.MutableRefObject<Editor | undefined>;
  onContentChange: (value: string) => void;
}) => {
  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <MdCode className={styles.toolbarIcon} />
          <span className={styles.toolbarTitle}>Component.tsx</span>
        </div>
      </div>
      <div className={styles.editorContainer}>
        <CodeEditor
          value={source}
          autoCursor
          autoScroll
          options={{
            mode: "jsx",
            theme: isDark ? "blackboard" : "one-light",
            lineNumbers: true,
            firstLineNumber: 1,
            scrollbarStyle: "native",
            viewportMargin: 50,
            lineWrapping: false,
            smartIndent: true,
            extraKeys: {
              "Shift-Tab": "indentLess",
              "Ctrl-S": () => {}, // 禁用默认保存
              "Cmd-S": () => {}, // 禁用默认保存
            },
            indentUnit: 2,
            tabSize: 2,
            cursorHeight: 1,
            autoCloseBrackets: true,
          }}
          onChange={(_editor, _data, value) => {
            onContentChange(value);
          }}
          editorDidMount={(editor) => {
            editorRef.current = editor;
          }}
          editorWillUnmount={() => {
            editorRef.current = undefined;
          }}
        />
      </div>
    </div>
  );
};

// 预览面板
const PreviewPane = ({
  content,
  onRefresh,
}: {
  content: string;
  onRefresh: () => void;
}) => {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarTitle}>预览 / Preview</span>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.toolbarButton}
            title="刷新预览"
            onClick={onRefresh}
          >
            <MdRefresh />
          </button>
          <button
            className={classnames(styles.toolbarButton, {
              [styles.active]: viewMode === "desktop",
            })}
            title="桌面视图"
            onClick={() => setViewMode("desktop")}
          >
            <MdLaptop />
          </button>
          <button
            className={classnames(styles.toolbarButton, {
              [styles.active]: viewMode === "mobile",
            })}
            title="移动视图"
            onClick={() => setViewMode("mobile")}
          >
            <MdSmartphone />
          </button>
        </div>
      </div>
      <div className={styles.previewContainer}>
        {viewMode === "mobile" ? (
          <div className={styles.mobileFrame}>
            <div className={styles.mobileScreen}>
              <CustomBlockPreview content={content} />
            </div>
          </div>
        ) : (
          <div className={styles.desktopPreview}>
            <CustomBlockPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
};

const CustomBlockSourceEditor = ({
  block,
  onBack,
}: CustomBlockSourceEditorProps) => {
  const [saving, setSaving] = useState(false);
  const [previewContent, setPreviewContent] = useState(block.source);
  const [refreshKey, setRefreshKey] = useState(0);
  const editorRef = useRef<Editor>();
  const { isDark } = useTheme();

  const handleSave = useMemoizedFn(async () => {
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const currentSource = editorRef.current.getValue();
      await updateCustomBlockSource(block.id, currentSource);
      message.success("保存成功");
    } catch (error) {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleRefresh = useMemoizedFn(() => {
    setRefreshKey((prev) => prev + 1);
  });

  return (
    <div className={styles.ideContainer}>
      {/* 顶部导航栏 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={onBack} className={styles.backButton}>
            <MdArrowBack />
          </button>
          <div className={styles.headerTitle}>
            <h1 className={styles.title}>{block.manifest.name}</h1>
            <div className={styles.divider} />
            <span className={styles.subtitle}>编辑组件源码</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={styles.saveButton}
        >
          <MdSave />
          <span>{saving ? "保存中..." : "保存"}</span>
        </button>
      </div>

      {/* 主体内容区域 */}
      <div className={styles.mainContent}>
        <ResizablePanel
          leftPanel={
            <EditorPane
              source={block.source}
              isDark={isDark}
              editorRef={editorRef}
              onContentChange={setPreviewContent}
            />
          }
          rightPanel={
            <PreviewPane
              key={refreshKey}
              content={previewContent}
              onRefresh={handleRefresh}
            />
          }
          defaultLeftWidth={50}
          minLeftWidth={30}
          maxLeftWidth={70}
        />
      </div>
    </div>
  );
};

export default CustomBlockSourceEditor;
