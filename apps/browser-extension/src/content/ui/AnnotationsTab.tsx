import { Highlighter, Trash2 } from "lucide-react";
import { HIGHLIGHT_COLORS } from "@tau/shared/browser-companion";
import { cn, IconButton } from "@tau/ui";
import { HIGHLIGHT_HEX } from "../page/highlights";
import { useCompanion } from "../state/store";
import { useController } from "./context";
import { Swatch } from "./SelectionToolbar";

/** 本页标注：按页面顺序，颜色筛选，点击滚到原文；找不到原文的单独归在末尾 */
export function AnnotationsTab() {
  const controller = useController();
  const annotations = useCompanion(state => state.annotations);
  const unlocated = useCompanion(state => state.unlocated);
  const filter = useCompanion(state => state.filter);
  const ready = useCompanion(state => state.status.state === "ready");
  const list = annotations.filter(item => !filter || item.color === filter);
  const missing = new Set(unlocated);

  return (
    <>
      <div className="flex items-center gap-1 px-4 pt-2 pb-1.5">
        <button
          type="button"
          onClick={() => useCompanion.setState({ filter: null })}
          className={cn(
            "text-tau-sm h-[26px] rounded-full px-2.5",
            filter ? "text-ink-2 hover:bg-hover" : "bg-accent-soft text-accent-text"
          )}
        >
          全部
        </button>
        {HIGHLIGHT_COLORS.map(color => (
          <button
            key={color}
            type="button"
            aria-pressed={filter === color}
            onClick={() => useCompanion.setState({ filter: filter === color ? null : color })}
            className={cn(
              "grid size-[26px] place-items-center rounded-full",
              filter === color ? "bg-hover border-line-1 border" : "hover:bg-hover"
            )}
          >
            <Swatch color={color} size={14} />
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-0.5 pb-2">
        {list.length === 0 ? (
          <div className="text-tau-meta text-ink-3 flex h-full flex-col items-center justify-center px-6 py-10 text-center">
            <Highlighter size={22} strokeWidth={1.6} className="mb-2" />
            {filter ? "这个颜色还没有标注" : "选中页面文字即可高亮或批注"}
          </div>
        ) : (
          list.map(item => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => controller.locateAnnotation(item.id)}
              onKeyDown={event => event.key === "Enter" && controller.locateAnnotation(item.id)}
              className="hover:bg-hover group rounded-tau-sm relative flex w-full cursor-pointer gap-2.5 px-2 py-2.5 text-left"
            >
              <span
                className="w-[3px] flex-none rounded-sm"
                style={{
                  background: `color-mix(in srgb, ${HIGHLIGHT_HEX[item.color]} 75%, transparent)`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-tau-body-lg text-ink-1 line-clamp-3 font-serif">{item.text}</p>
                {item.note && (
                  <p className="text-tau-meta text-ink-2 mt-1 whitespace-pre-wrap">{item.note}</p>
                )}
                <p className="text-tau-micro text-ink-3 mt-1">
                  {missing.has(item.id)
                    ? "页面上找不到这段原文"
                    : new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
              <IconButton
                aria-label="删除标注"
                className="hover:text-danger absolute top-1.5 right-1.5 size-6 opacity-0 group-hover:opacity-100"
                onClick={event => {
                  event.stopPropagation();
                  controller.removeAnnotation(item.id);
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </IconButton>
            </div>
          ))
        )}
      </div>
      <div className="text-tau-sm text-ink-3 flex items-center gap-2 px-4 pt-2 pb-3">
        <span className={cn("size-1.5 rounded-full", ready ? "bg-ok" : "bg-ink-3")} />
        {ready ? "已同步到 Tau" : "存在本机，连上 Tau 后同步"}
        <span className="flex-1" />
        {annotations.length} 条
      </div>
    </>
  );
}
