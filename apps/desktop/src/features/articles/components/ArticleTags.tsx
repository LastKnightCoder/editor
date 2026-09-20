/**
 * 文章标签行（A4 定稿：正文末、分组底 pills）。
 * 添加：点「添加」出现行内输入，Enter 提交 / Esc 取消；移除：pill 尾 ×。
 * TODO(后续补充)：点文字改名（legacy 支持 tag 重命名，保持顺序替换）。
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@tau/ui";

interface ArticleTagsProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onDelete: (tag: string) => void;
  className?: string;
}

export function ArticleTags({ tags, onAdd, onDelete, className }: ArticleTagsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const commitAdd = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) onAdd(tag);
    setDraft("");
    setAdding(false);
  };

  return (
    <div
      className={cn(
        "border-line-2 mt-[34px] flex flex-wrap items-center gap-1.5 border-t pt-[18px]",
        className
      )}
    >
      <span className="text-tau-micro text-ink-3 mr-0.5">标签</span>
      {tags.map(tag => (
        <span
          key={tag}
          className="rounded-tau-sm bg-group text-tau-micro text-ink-2 flex h-6 items-center gap-1 px-2.5"
        >
          {tag}
          <button
            type="button"
            title="移除标签"
            aria-label={`移除标签 ${tag}`}
            onClick={() => onDelete(tag)}
            className="text-ink-3 hover:bg-danger-soft hover:text-danger grid size-3.5 place-items-center rounded-[4px] transition-colors"
          >
            <X className="size-[11px]" strokeWidth={1.75} />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commitAdd}
          onKeyDown={event => {
            if (event.key === "Enter") commitAdd();
            if (event.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          placeholder="标签名"
          aria-label="新标签名"
          className="rounded-tau-sm border-line-1 text-tau-micro text-ink-1 placeholder:text-ink-3 h-6 w-24 border border-dashed bg-transparent px-2 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="添加标签"
          className="rounded-tau-sm border-line-1 text-tau-micro text-ink-3 hover:border-ink-3 hover:text-ink-2 flex h-6 items-center gap-1 border border-dashed px-2.5 transition-colors"
        >
          <Plus className="size-3" strokeWidth={1.75} />
          添加
        </button>
      )}
    </div>
  );
}
