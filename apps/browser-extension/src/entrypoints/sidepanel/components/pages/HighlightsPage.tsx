import { useMemo, useState } from "react";
import { Highlighter } from "lucide-react";
import { cn } from "@tau/ui";
import type { HighlightColor } from "../../../../content/types";
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_ORDER } from "../../../../content/types";
import { usePageHighlights } from "../../../../hooks/usePageHighlights";
import { HighlightCard } from "../HighlightCard";
import { SubpageHeader } from "../SubpageHeader";

/** 本页全部高亮：按颜色筛选，逐条改颜色 / 样式 / 想法，点引文在网页中定位 */
export default function HighlightsPage({
  url,
  onBack,
}: {
  url: string | null;
  onBack: () => void;
}) {
  const { highlights, annotations, setColor, setStyle, remove, saveAnnotation } =
    usePageHighlights(url);
  const [filter, setFilter] = useState<HighlightColor | null>(null);

  const sorted = useMemo(
    () => [...highlights].sort((a, b) => b.createdAt - a.createdAt),
    [highlights]
  );
  const counts = useMemo(() => {
    const map = new Map<HighlightColor, number>();
    highlights.forEach(h => map.set(h.color, (map.get(h.color) ?? 0) + 1));
    return map;
  }, [highlights]);
  const visible = filter ? sorted.filter(h => h.color === filter) : sorted;

  return (
    <div className="flex h-full flex-col">
      <SubpageHeader title={`高亮 ${highlights.length || ""}`} onBack={onBack} />
      {highlights.length > 1 && counts.size > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-1 pt-2.5">
          <FilterChip active={filter === null} onClick={() => setFilter(null)}>
            全部 {highlights.length}
          </FilterChip>
          {HIGHLIGHT_COLOR_ORDER.filter(color => counts.has(color)).map(color => (
            <FilterChip key={color} active={filter === color} onClick={() => setFilter(color)}>
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
              />
              {counts.get(color)}
            </FilterChip>
          ))}
        </div>
      )}
      <div className="tau-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-8 pt-20 text-center">
            <span className="bg-accent-soft text-accent-text grid size-11 place-items-center rounded-[14px]">
              <Highlighter size={20} strokeWidth={1.75} />
            </span>
            <p className="text-tau-title text-ink-1 font-semibold">这一页还没有高亮</p>
            <p className="text-tau-sm text-ink-2 leading-[1.7]">
              在网页上选中文字，用浮出的工具条选个颜色
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map(highlight => (
              <div key={highlight.id} className="border-line-1 bg-surface rounded-tau-md border">
                <HighlightCard
                  highlight={highlight}
                  annotation={annotations[highlight.id]}
                  onColorChange={color => void setColor(highlight.id, color)}
                  onStyleChange={style => void setStyle(highlight.id, style)}
                  onDelete={() => void remove(highlight.id)}
                  onSaveAnnotation={text => void saveAnnotation(highlight.id, text)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-tau-sm inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 transition-colors",
        active
          ? "bg-accent-soft text-accent-text border-transparent"
          : "border-line-1 bg-surface text-ink-2 hover:text-ink-1"
      )}
    >
      {children}
    </button>
  );
}
