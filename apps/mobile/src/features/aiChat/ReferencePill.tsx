// 回答正文里的引用：带类型图标与标签色的小胶囊（日记紫、卡片绿、文章蓝……），点按交给宿主打开预览。
// 作为 MarkdownRenderer 的 span 覆盖，非引用的 span 原样渲染。

import { memo, type ReactNode } from "react";
import { FileText, FolderKanban, Layers, NotebookPen, Puzzle, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";

const KIND: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  card: { icon: Layers, tone: "bg-tag-1-soft text-tag-1", label: "卡片" },
  article: { icon: FileText, tone: "bg-tag-2-soft text-tag-2", label: "文章" },
  "project-item": { icon: FolderKanban, tone: "bg-tag-4-soft text-tag-4", label: "项目文档" },
  project_item: { icon: FolderKanban, tone: "bg-tag-4-soft text-tag-4", label: "项目文档" },
  "diary-daily": { icon: NotebookPen, tone: "bg-tag-3-soft text-tag-3", label: "日记" },
  "diary-moment": { icon: NotebookPen, tone: "bg-tag-3-soft text-tag-3", label: "日记" },
  "plugin-entity": { icon: Puzzle, tone: "bg-tag-5-soft text-tag-5", label: "插件内容" },
};
const FALLBACK = { icon: FileText, tone: "bg-accent-soft text-accent-text", label: "引用" };

type SpanProps = {
  className?: string;
  children?: ReactNode;
  "data-id"?: string;
  "data-type"?: string;
  "data-text"?: string;
};

export function createReferenceSpan(onOpen: (id: number, type: string, text: string) => void) {
  return memo(function ReferenceSpan({ className, children, ...props }: SpanProps) {
    if (className !== "document-reference")
      return (
        <span className={className} {...props}>
          {children}
        </span>
      );
    const type = props["data-type"] ?? "";
    const id = Number.parseInt(props["data-id"] ?? "0", 10);
    const text = props["data-text"] ?? "";
    const kind = KIND[type] ?? FALLBACK;
    const Icon = kind.icon;
    return (
      <button
        type="button"
        aria-label={`${kind.label}：${text}`}
        onClick={() => onOpen(id, type, text)}
        className={cn(
          "mx-px inline-flex h-[22px] max-w-full items-center gap-[3px] rounded-[7px] pr-[7px] pl-[5px] align-[1px] text-[13px] leading-none font-medium transition-transform active:scale-95",
          kind.tone
        )}
      >
        <Icon size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{children}</span>
      </button>
    );
  });
}
