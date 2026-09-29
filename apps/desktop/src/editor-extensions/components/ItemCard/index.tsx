import type { KeyboardEvent } from "react";
import { getEditorText } from "@/utils";
import { Descendant } from "slate";
import { FileText, ArrowUpRight } from "lucide-react";
import { ProjectItem } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";

interface ItemCardProps {
  item: Partial<ProjectItem> & {
    content: Descendant[];
  };
  onClick: () => void;
}

// 尺寸用 em：跟随编辑器字号缩放
const ItemCard = (props: ItemCardProps) => {
  const { item, onClick } = props;

  const { title } = useProjectWebLinkMeta(item);
  const displayTitle = title || item.title || "未命名文档";
  const desc = getEditorText(item.content, 80);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      contentEditable={false}
      role="button"
      tabIndex={0}
      aria-label={`打开文档：${displayTitle}`}
      className="rounded-tau-md border-line-1 bg-surface text-ink-1 ease-tau-out hover:border-accent hover:bg-hover hover:shadow-card active:bg-press focus-visible:border-accent group flex min-w-0 cursor-pointer select-none flex-col gap-[0.625em] border px-[1.125em] py-[1em] outline-none transition-[border-color,background-color,box-shadow] duration-[160ms] focus-visible:shadow-[var(--tau-focus-ring)]"
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="flex min-w-0 items-center gap-[0.625em]">
        <span
          aria-hidden
          className="rounded-tau-sm bg-accent-soft text-accent-text grid size-[2em] flex-none place-items-center"
        >
          <FileText className="size-[1.125em]" />
        </span>
        <div className="group-hover:text-accent-text ease-tau-out min-w-0 flex-1 truncate text-[1.0625em] font-semibold leading-[1.4] transition-colors duration-[160ms]">
          {displayTitle}
        </div>
        <ArrowUpRight
          aria-hidden
          className="text-accent-text ease-tau-out size-[1em] flex-none -translate-x-0.5 translate-y-0.5 opacity-0 transition-[opacity,translate] duration-[160ms] group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
        />
      </div>
      {/* 固定两行高度，避免网格中卡片高低不齐 */}
      <div className="text-ink-2 line-clamp-2 min-h-[3.2em] text-[0.875em] leading-[1.6]">
        {desc || "暂无内容"}
      </div>
    </div>
  );
};

export default ItemCard;
