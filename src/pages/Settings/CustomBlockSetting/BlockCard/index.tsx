import { Switch } from "antd";
import { MdPerson } from "react-icons/md";
import type { ICustomBlock } from "@/types/custom-block";
import TemplatePreview from "@/components/Editor/extensions/custom-block/components/TemplateSelector/TemplatePreview";
import { importFromMarkdown } from "@/utils/markdown";
import { getEditorText } from "@/utils/editor";
import styles from "./index.module.less";

interface BlockCardProps {
  block: ICustomBlock;
  mode?: "list" | "select";
  onClick?: () => void;
  onToggle?: (checked: boolean, e: React.MouseEvent) => void;
}

const BlockCard = ({
  block,
  mode = "list",
  onClick,
  onToggle,
}: BlockCardProps) => {
  return (
    <div
      className="bg-bg-container border border-[#f0f0f0] dark:border-[#2a2a2a] rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ease-in-out flex flex-col h-[260px] hover:border-brand hover:shadow-sm"
      onClick={onClick}
    >
      {/* 预览区域 */}
      <div
        className={`h-[170px] bg-bg-canvas border-b border-border-1 flex items-center justify-center overflow-hidden relative p-4 ${styles.previewArea}`}
      >
        <TemplatePreview content={block.source} />
      </div>

      {/* 信息区域 */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {/* 第一行：标题 + 开关/标签 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-text-1 m-0 overflow-hidden text-ellipsis whitespace-nowrap tracking-tight">
              {block.manifest.name}
            </h3>
          </div>
          {mode === "list" && onToggle && (
            <div className="flex-shrink-0">
              <Switch
                checked={block.enabled}
                onChange={(checked, e) =>
                  onToggle(checked, e as React.MouseEvent)
                }
                size="small"
                onClick={(_, e) => e.stopPropagation()}
              />
            </div>
          )}
          {mode === "select" && block.isLocal && (
            <span className="px-2.5 py-0.5 text-[11px] bg-tag-bg text-tag-text rounded-full font-medium">
              本地创建
            </span>
          )}
        </div>

        {/* 第二行：描述 */}
        <p className="text-xs text-text-3 leading-relaxed m-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {block.manifest.description
            ? getEditorText(importFromMarkdown(block.manifest.description), 80)
            : "暂无描述"}
        </p>

        {/* 第三行：作者和标签 */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex items-center gap-1.5 text-xs text-text-2">
            <MdPerson className="w-3.5 h-3.5 opacity-70" />
            <span>{block.manifest.author}</span>
          </div>
          {mode === "list" && block.isLocal && (
            <span className="px-2.5 py-0.5 text-[11px] bg-tag-bg text-tag-text rounded-full font-medium">
              本地创建
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlockCard;
