import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { message } from "antd";
import { MdArrowBack, MdSave, MdCode, MdRefresh, MdSmartphone, MdLaptop } from "react-icons/md";
import { UnControlled as CodeEditor } from "react-codemirror2";
import { Editor } from "codemirror";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";
import { updateCustomBlockSource } from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import ResizablePanel from "@/components/ResizablePanel";
import useThemeColors from "@/hooks/useThemeColors";
import "codemirror/mode/jsx/jsx";
import CustomBlockPreview from "./CustomBlockPreview";

interface CustomBlockSourceEditorProps {
  block: ICustomBlock;
  onBack: () => void;
}

// 编辑器面板
const EditorPane = ({
  source,
  isDark,
  editorRef,
  onContentChange,
}: {
  source: string;
  isDark: boolean;
  editorRef: React.MutableRefObject<Editor | null>;
  onContentChange: (value: string) => void;
}) => {
  const themeColors = useThemeColors();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={classNames(
          "flex-flex-shrink-0 flex h-10 items-center justify-between border-b px-4",
          themeColors.inputBgClass,
          themeColors.borderClass
        )}
      >
        <div className="flex items-center gap-2">
          <MdCode className={classNames("h-4 w-4 opacity-70", themeColors.textClass)} />
          <span className={classNames("text-[13px] font-medium", themeColors.textClass)}>
            Component.tsx
          </span>
        </div>
      </div>
      <div className="codemirror-container flex-1 overflow-hidden">
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
              // 禁用默认保存快捷键
              "Ctrl-S": false,
              "Cmd-S": false,
            },
            indentUnit: 2,
            tabSize: 2,
            cursorHeight: 1,
            autoCloseBrackets: true,
          }}
          onChange={(_editor, _data, value) => {
            onContentChange(value);
          }}
          editorDidMount={editor => {
            editorRef.current = editor;
          }}
          editorWillUnmount={() => {
            editorRef.current = null;
          }}
        />
      </div>
    </div>
  );
};

// 预览面板
const PreviewPane = ({ content, onRefresh }: { content: string; onRefresh: () => void }) => {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const themeColors = useThemeColors();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={classNames(
          "flex-flex-shrink-0 flex h-10 items-center justify-between border-b px-4",
          themeColors.inputBgClass,
          themeColors.borderClass
        )}
      >
        <div className="flex items-center gap-2">
          <span className={classNames("text-[13px] font-medium", themeColors.textClass)}>
            预览 / Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={classNames(
              "rounded p-1 transition-all",
              themeColors.secondaryTextClass,
              themeColors.hoverClass,
              "hover:text-current!"
            )}
            title="刷新预览"
            onClick={onRefresh}
          >
            <MdRefresh className="h-4 w-4" />
          </button>
          <button
            className={classNames(
              "rounded p-1 transition-all",
              viewMode === "desktop"
                ? "bg-blue-100 text-[var(--th-active-text)] dark:bg-blue-500/15"
                : classNames(themeColors.secondaryTextClass, themeColors.hoverClass)
            )}
            title="桌面视图"
            onClick={() => setViewMode("desktop")}
          >
            <MdLaptop className="h-4 w-4" />
          </button>
          <button
            className={classNames(
              "rounded p-1 transition-all",
              viewMode === "mobile"
                ? "bg-blue-100 text-[var(--th-active-text)] dark:bg-blue-500/15"
                : classNames(themeColors.secondaryTextClass, themeColors.hoverClass)
            )}
            title="移动视图"
            onClick={() => setViewMode("mobile")}
          >
            <MdSmartphone className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={classNames("flex-1 overflow-auto", themeColors.inputBgClass)}>
        {viewMode === "mobile" ? (
          <div className="flex h-full w-full items-center justify-center px-5 py-10">
            <div
              className={classNames(
                "relative h-[667px] w-[375px] overflow-auto rounded-[36px] px-4 pb-4 pt-10",
                themeColors.cardBgClass
              )}
              style={{
                boxShadow: "0 0 0 14px #1f1f1f, 0 0 0 16px #191919, 0 0 50px rgba(0, 0, 0, 0.5)",
              }}
            >
              {/* 刘海屏效果 */}
              <div
                className="absolute left-1/2 top-0 z-10 h-[30px] w-[150px] -translate-x-1/2 rounded-b-[20px] bg-[#1f1f1f] dark:bg-[#333]"
                style={{ content: '""' }}
              />
              <CustomBlockPreview content={content} />
            </div>
          </div>
        ) : (
          <div className="h-full w-full p-5">
            <CustomBlockPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
};

const CustomBlockSourceEditor = ({ block, onBack }: CustomBlockSourceEditorProps) => {
  const themeColors = useThemeColors();
  const [saving, setSaving] = useState(false);
  const [previewContent, setPreviewContent] = useState(block.source);
  const [refreshKey, setRefreshKey] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const { isDark } = useTheme();

  const handleSave = useMemoizedFn(async () => {
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const currentSource = editorRef.current.getValue();
      await updateCustomBlockSource(block.id, currentSource);
      message.success("保存成功");
      // 保存成功后自动退出编辑模式
      onBack();
    } catch (error) {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleRefresh = useMemoizedFn(() => {
    setRefreshKey(prev => prev + 1);
  });

  const editorContent = (
    <div
      className="z-9999 fixed inset-0 flex flex-col overflow-hidden bg-white dark:bg-[#0a0a0a]"
      style={{ top: "40px" }} // 为顶部 Header 预留空间
    >
      {/* 顶部导航栏 */}
      <div
        className={classNames(
          "flex h-14 shrink-0 items-center justify-between border-b px-5",
          themeColors.borderClass
        )}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className={classNames(
              "rounded p-2 transition-colors",
              themeColors.textClass,
              themeColors.hoverClass
            )}
          >
            <MdArrowBack className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <h1 className={classNames("m-0 text-base font-semibold", themeColors.activeTextClass)}>
              {block.manifest.name}
            </h1>
            <div className={classNames("h-5 w-px", themeColors.borderClass)} />
            <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
              编辑组件源码
            </span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={classNames(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            themeColors.primaryButtonClass,
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <MdSave className="h-4 w-4" />
          <span>{saving ? "保存中..." : "保存"}</span>
        </button>
      </div>

      {/* 主体内容区域 */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
            <PreviewPane key={refreshKey} content={previewContent} onRefresh={handleRefresh} />
          }
          defaultLeftWidth={50}
          minLeftWidth={30}
          maxLeftWidth={70}
        />
      </div>
    </div>
  );

  return createPortal(editorContent, document.body);
};

export default CustomBlockSourceEditor;
