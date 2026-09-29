/**
 * 阅读区右上角的查找条：「关键词」逐个跳转高亮（引擎全文检索），「按意思找」走 AI 索引。
 * ↵ 下一个、⇧↵ 上一个；Esc 经页面浮层仲裁关闭。
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Search, Sparkles, X } from "lucide-react";
import { FADE_SCROLL_CLASS, FilterPill, IconButton, Spinner, cn, useEdgeFade } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";

export type FindMode = "keyword" | "semantic";

export interface FindResultRow {
  page: number;
  before: string;
  match: string;
  after: string;
  /** 按意思找的相关度（0–1） */
  score?: number;
}

interface FindBarProps {
  mode: FindMode;
  query: string;
  results: FindResultRow[];
  current: number;
  loading: boolean;
  /** 结果为空时的说明（未命中、索引未就绪等） */
  notice: string | null;
  onModeChange: (mode: FindMode) => void;
  onQueryChange: (query: string) => void;
  /** 按意思找：回车提交 */
  onSubmit: () => void;
  onPick: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function FindBar(props: FindBarProps) {
  const { mode, query, results, current, loading, notice } = props;
  useOverlayDismiss(props.onClose);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);
  const keyword = mode === "keyword";

  return (
    <div
      role="search"
      onPointerDown={e => e.stopPropagation()}
      className="bg-surface shadow-float rounded-tau-md absolute right-3 top-3 z-30 flex w-[360px] flex-col gap-2 p-2"
    >
      <div className="flex items-center gap-1">
        <label className="border-line-1 bg-surface focus-within:border-accent rounded-tau-sm flex h-8 min-w-0 flex-1 items-center gap-1.5 border px-2 focus-within:shadow-[var(--tau-focus-ring)]">
          <Search size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          <input
            autoFocus
            value={query}
            placeholder={keyword ? "查找关键词" : "描述你要找的内容，↵ 搜索"}
            onChange={e => props.onQueryChange(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (!keyword) props.onSubmit();
              else if (e.shiftKey) props.onPrev();
              else props.onNext();
            }}
            className="text-tau-sm text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
          />
          {loading ? (
            <Spinner className="size-3" />
          ) : (
            keyword &&
            results.length > 0 && (
              <span className="text-tau-meta text-ink-3 shrink-0 tabular-nums">
                {current + 1} / {results.length}
              </span>
            )
          )}
        </label>
        {keyword && (
          <>
            <IconButton
              title="上一个 (⇧↵)"
              aria-label="上一个"
              onClick={props.onPrev}
              className="size-7"
            >
              <ChevronUp size={15} strokeWidth={1.75} />
            </IconButton>
            <IconButton
              title="下一个 (↵)"
              aria-label="下一个"
              onClick={props.onNext}
              className="size-7"
            >
              <ChevronDown size={15} strokeWidth={1.75} />
            </IconButton>
          </>
        )}
        <IconButton
          title="关闭 (Esc)"
          aria-label="关闭查找"
          onClick={props.onClose}
          className="size-7"
        >
          <X size={15} strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="flex items-center gap-1.5">
        <FilterPill active={keyword} onClick={() => props.onModeChange("keyword")} label="关键词" />
        <FilterPill
          active={!keyword}
          onClick={() => props.onModeChange("semantic")}
          label="按意思找"
          icon={<Sparkles size={12} strokeWidth={1.75} />}
        />
      </div>

      {results.length > 0 ? (
        <div ref={setListEl} className={cn(FADE_SCROLL_CLASS, "-mr-1 max-h-[320px]")}>
          {results.map((row, index) => (
            <button
              key={index}
              type="button"
              onClick={() => props.onPick(index)}
              className={cn(
                "rounded-tau-sm text-tau-sm ease-tau-out flex w-full flex-col gap-0.5 px-2 py-1.5 text-left transition-colors duration-[160ms]",
                keyword && index === current ? "bg-selected" : "hover:bg-hover"
              )}
            >
              <span className="text-tau-meta text-ink-3 tabular-nums">
                第 {row.page} 页{row.score != null ? ` · ${row.score.toFixed(2)}` : ""}
              </span>
              <span className="text-ink-2 line-clamp-2">
                {row.before}
                {row.match && <b className="text-ink-1 font-semibold">{row.match}</b>}
                {row.after}
              </span>
            </button>
          ))}
        </div>
      ) : (
        notice && <p className="text-tau-meta text-ink-3 px-1 pb-1">{notice}</p>
      )}
    </div>
  );
}
