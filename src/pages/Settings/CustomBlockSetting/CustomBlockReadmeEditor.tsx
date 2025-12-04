import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { message } from "antd";
import { MdArrowBack, MdSave } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { updateCustomBlockReadme } from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import Editor, { EditorRef } from "@/components/Editor";
import type { Descendant } from "slate";
import useThemeColors from "@/hooks/useThemeColors";

interface CustomBlockReadmeEditorProps {
  block: ICustomBlock;
  onBack: () => void;
}

const CustomBlockReadmeEditor = ({
  block,
  onBack,
}: CustomBlockReadmeEditorProps) => {
  const themeColors = useThemeColors();
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const [editorValue, setEditorValue] = useState<Descendant[]>(() =>
    importFromMarkdown(block.readme || ""),
  );
  const [documentTitle, setDocumentTitle] = useState<string>(
    block.manifest.name,
  );

  useEffect(() => {
    if (editorRef.current && block.readme) {
      const value = importFromMarkdown(block.readme);
      editorRef.current.setEditorValue(value);
    }
  }, [block.readme]);

  // 从编辑器内容中提取第一个标题
  useEffect(() => {
    // 查找第一个标题节点
    const firstHeading = editorValue.find(
      (node: any) => node.type === "heading-one" || node.type === "heading-two",
    ) as any;

    if (firstHeading?.children && Array.isArray(firstHeading.children)) {
      // 提取标题文本
      const headingText = firstHeading.children
        .map((child: any) => child.text || "")
        .join("")
        .trim();

      if (headingText) {
        setDocumentTitle(headingText);
      } else {
        setDocumentTitle(block.manifest.name);
      }
    } else {
      setDocumentTitle(block.manifest.name);
    }
  }, [editorValue, block.manifest.name]);

  const handleSave = useMemoizedFn(async () => {
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const editor = editorRef.current.getEditor();
      const value = editor.children;
      const markdown = getMarkdown(value as Descendant[]);
      await updateCustomBlockReadme(block.id, markdown);
      message.success("保存成功");
      // 保存成功后自动退出编辑模式
      onBack();
    } catch (error) {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleChange = useMemoizedFn((value: Descendant[]) => {
    setEditorValue(value);
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
              {documentTitle}
            </h1>
            <div className={classNames("w-px h-5", themeColors.borderClass)} />
            <span
              className={classNames("text-xs", themeColors.secondaryTextClass)}
            >
              编辑使用说明
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
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto flex justify-center py-10 px-5">
          <div className="w-full max-w-[900px]">
            <Editor
              ref={editorRef}
              initValue={editorValue}
              onChange={handleChange}
              readonly={false}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(editorContent, document.body);
};

export default CustomBlockReadmeEditor;
