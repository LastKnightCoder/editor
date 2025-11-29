import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";
import { updateCustomBlockSource } from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import { compileAndExecuteCustomBlock } from "@/components/Editor";
import ResizablePanel from "@/components/ResizablePanel";
import useThemeColors from "@/hooks/useThemeColors";
import "codemirror/mode/jsx/jsx";

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
    })
      .then((cleanupFn) => {
        cleanup = cleanupFn;
      })
      .catch((err) => {
        console.error("Custom block preview error", err);
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
  const themeColors = useThemeColors();

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <div
        className={classNames(
          "h-10 flex items-center justify-between px-4 border-b flex-flex-shrink-0",
          themeColors.inputBgClass,
          themeColors.borderClass,
        )}
      >
        <div className="flex items-center gap-2">
          <MdCode
            className={classNames("w-4 h-4 opacity-70", themeColors.textClass)}
          />
          <span
            className={classNames(
              "text-[13px] font-medium",
              themeColors.textClass,
            )}
          >
            Component.tsx
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden codemirror-container">
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
  const themeColors = useThemeColors();

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <div
        className={classNames(
          "h-10 flex items-center justify-between px-4 border-b flex-flex-shrink-0",
          themeColors.inputBgClass,
          themeColors.borderClass,
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={classNames(
              "text-[13px] font-medium",
              themeColors.textClass,
            )}
          >
            预览 / Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={classNames(
              "p-1 rounded transition-all",
              themeColors.secondaryTextClass,
              themeColors.hoverClass,
              "hover:text-current!",
            )}
            title="刷新预览"
            onClick={onRefresh}
          >
            <MdRefresh className="w-4 h-4" />
          </button>
          <button
            className={classNames(
              "p-1 rounded transition-all",
              viewMode === "desktop"
                ? "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/15"
                : classNames(
                    themeColors.secondaryTextClass,
                    themeColors.hoverClass,
                  ),
            )}
            title="桌面视图"
            onClick={() => setViewMode("desktop")}
          >
            <MdLaptop className="w-4 h-4" />
          </button>
          <button
            className={classNames(
              "p-1 rounded transition-all",
              viewMode === "mobile"
                ? "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/15"
                : classNames(
                    themeColors.secondaryTextClass,
                    themeColors.hoverClass,
                  ),
            )}
            title="移动视图"
            onClick={() => setViewMode("mobile")}
          >
            <MdSmartphone className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        className={classNames("flex-1 overflow-auto", themeColors.inputBgClass)}
      >
        {viewMode === "mobile" ? (
          <div className="flex items-center justify-center w-full h-full py-10 px-5">
            <div
              className={classNames(
                "w-[375px] h-[667px] rounded-[36px] overflow-auto relative pt-10 px-4 pb-4",
                themeColors.cardBgClass,
              )}
              style={{
                boxShadow:
                  "0 0 0 14px #1f1f1f, 0 0 0 16px #191919, 0 0 50px rgba(0, 0, 0, 0.5)",
              }}
            >
              {/* 刘海屏效果 */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[30px] bg-[#1f1f1f] dark:bg-[#333] rounded-b-[20px] z-10"
                style={{ content: '""' }}
              />
              <CustomBlockPreview content={content} />
            </div>
          </div>
        ) : (
          <div className="w-full h-full p-5">
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
  const themeColors = useThemeColors();
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
      // 保存成功后自动退出编辑模式
      onBack();
    } catch (error) {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleRefresh = useMemoizedFn(() => {
    setRefreshKey((prev) => prev + 1);
  });

  const editorContent = (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden z-9999 bg-white dark:bg-[#0a0a0a]"
      style={{ top: "40px" }} // 为顶部 Header 预留空间
    >
      {/* 顶部导航栏 */}
      <div
        className={classNames(
          "h-14 flex items-center justify-between px-5 border-b shrink-0",
          themeColors.borderClass,
        )}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className={classNames(
              "p-2 rounded transition-colors",
              themeColors.textClass,
              themeColors.hoverClass,
            )}
          >
            <MdArrowBack className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <h1
              className={classNames(
                "text-base font-semibold m-0",
                themeColors.activeTextClass,
              )}
            >
              {block.manifest.name}
            </h1>
            <div className={classNames("w-px h-5", themeColors.borderClass)} />
            <span
              className={classNames("text-xs", themeColors.secondaryTextClass)}
            >
              编辑组件源码
            </span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={classNames(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
            themeColors.primaryButtonClass,
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          <MdSave className="w-4 h-4" />
          <span>{saving ? "保存中..." : "保存"}</span>
        </button>
      </div>

      {/* 主体内容区域 */}
      <div className="flex-1 flex overflow-hidden min-h-0">
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

  return createPortal(editorContent, document.body);
};

export default CustomBlockSourceEditor;
