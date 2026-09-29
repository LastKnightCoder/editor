/**
 * 阅读器左面板（纸内左栏，开关在面包屑最前）：目录 / 页面 / 标注 / 书签。
 * 「标注」是查找与跳转入口（页面上只在页边留图钉）；须在 EmbedPDF 上下文内渲染（缩略图走引擎）。
 */

import { useEffect, useMemo, useState } from "react";
import { Bookmark, MessageSquareText, X } from "lucide-react";
import { ThumbImg, ThumbnailsPane, type ThumbMeta } from "@embedpdf/plugin-thumbnail/react";
import { FADE_SCROLL_CLASS, FilterPill, Segmented, cn, useEdgeFade } from "@tau/ui";
import type { PdfAnnotation, PdfBookmark } from "@/types";
import {
  COLOR_SPECS,
  PICKABLE_COLORS,
  STYLE_LABEL,
  annotationColor,
  annotationPage,
  annotationSnippet,
  filterAnnotations,
  markupStyleOf,
  noteText,
  sortAnnotations,
  type AnnotationFilter,
} from "../annotationModel";
import { bookmarkPage } from "../data";
import { activeOutlineKey, type OutlineRow } from "../outline";
import type { LeftTab } from "../readerPrefs";

interface LeftPanelProps {
  open: boolean;
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  outline: OutlineRow[];
  currentPage: number;
  records: PdfAnnotation[];
  activeRecordId: number | null;
  bookmarks: PdfBookmark[];
  onJumpPage: (page: number) => void;
  onJumpAnnotation: (record: PdfAnnotation) => void;
  onRemoveBookmark: (bookmark: PdfBookmark) => void;
}

const TABS: Array<{ key: LeftTab; label: string }> = [
  { key: "toc", label: "目录" },
  { key: "thumbs", label: "页面" },
  { key: "anns", label: "标注" },
  { key: "marks", label: "书签" },
];

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-tau-meta text-ink-3 px-2 py-6 text-center leading-relaxed">{children}</p>
  );
}

function ScrollBody({ children, className }: { children: React.ReactNode; className?: string }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(el);
  return (
    <div ref={setEl} className={cn(FADE_SCROLL_CLASS, "min-h-0 flex-1", className)}>
      {children}
    </div>
  );
}

export function LeftPanel(props: LeftPanelProps) {
  const { open, tab, onTabChange } = props;
  return (
    <aside
      aria-label="PDF 导航"
      aria-hidden={!open}
      className={cn(
        "ease-tau-out flex min-h-0 shrink-0 flex-col overflow-hidden transition-[width,opacity] duration-[220ms]",
        open ? "w-[260px] opacity-100" : "pointer-events-none w-0 opacity-0"
      )}
    >
      <div className="flex min-h-0 w-[260px] flex-1 flex-col gap-2.5 py-3.5 pl-3.5 pr-1.5">
        <Segmented<LeftTab>
          label="左面板"
          size="sm"
          value={tab}
          onValueChange={onTabChange}
          className="mr-2 w-auto"
        >
          {TABS.map(t => (
            <Segmented.Item
              key={t.key}
              value={t.key}
              label={t.label}
              className="flex-1 justify-center px-0"
            />
          ))}
        </Segmented>
        {tab === "toc" && <OutlineList {...props} />}
        {tab === "thumbs" && (
          <ThumbList currentPage={props.currentPage} onJump={props.onJumpPage} />
        )}
        {tab === "anns" && <AnnotationList {...props} />}
        {tab === "marks" && <BookmarkList {...props} />}
      </div>
    </aside>
  );
}

function OutlineList({ outline, currentPage, onJumpPage }: LeftPanelProps) {
  const active = useMemo(() => activeOutlineKey(outline, currentPage), [outline, currentPage]);
  if (outline.length === 0) return <Empty>这份 PDF 没有目录</Empty>;
  return (
    <ScrollBody>
      {outline.map(row => (
        <button
          key={row.key}
          type="button"
          disabled={row.page == null}
          onClick={() => row.page != null && onJumpPage(row.page)}
          className={cn(
            "rounded-tau-sm text-tau-sm ease-tau-out flex w-full items-baseline gap-2 py-1.5 pr-2 text-left transition-colors duration-[160ms]",
            row.key === active
              ? "bg-selected text-accent-text"
              : "text-ink-2 hover:bg-hover hover:text-ink-1",
            row.depth === 0 && "text-ink-1 font-medium"
          )}
          style={{ paddingLeft: 8 + row.depth * 14 }}
        >
          <span className="min-w-0 flex-1 truncate">{row.title}</span>
          {row.page != null && (
            <span className="text-tau-meta text-ink-3 shrink-0 tabular-nums">{row.page}</span>
          )}
        </button>
      ))}
    </ScrollBody>
  );
}

function ThumbList({
  currentPage,
  onJump,
}: {
  currentPage: number;
  onJump: (page: number) => void;
}) {
  // 缩略图面板是引擎组件（ref 被它占用），经标记属性取元素接边缘渐隐
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPane(wrap?.querySelector<HTMLElement>("[data-pdf-thumbs]") ?? null);
  }, [wrap]);
  useEdgeFade(pane);
  return (
    <div ref={setWrap} className="flex min-h-0 flex-1 flex-col">
      <ThumbnailsPane
        data-pdf-thumbs=""
        className={cn(FADE_SCROLL_CLASS, "relative min-h-0 flex-1")}
      >
        {(meta: ThumbMeta) => {
          const page = meta.pageIndex + 1;
          const active = page === currentPage;
          return (
            <button
              key={meta.pageIndex}
              type="button"
              onClick={() => onJump(page)}
              className="absolute flex w-full flex-col items-center"
              style={{ top: meta.top, height: meta.wrapperHeight }}
            >
              <span
                className={cn(
                  "shadow-card overflow-hidden rounded-[3px]",
                  active && "ring-accent ring-2"
                )}
                style={{ width: meta.width, height: meta.height }}
              >
                <ThumbImg meta={meta} />
              </span>
              <span
                className={cn(
                  "text-tau-meta mt-1.5 tabular-nums",
                  active ? "text-accent-text font-medium" : "text-ink-3"
                )}
                style={{ height: meta.labelHeight }}
              >
                {page}
              </span>
            </button>
          );
        }}
      </ThumbnailsPane>
    </div>
  );
}

function AnnotationList({ records, activeRecordId, onJumpAnnotation }: LeftPanelProps) {
  const [filter, setFilter] = useState<AnnotationFilter>("all");
  const sorted = useMemo(() => sortAnnotations(records), [records]);
  const list = useMemo(() => filterAnnotations(sorted, filter), [sorted, filter]);
  return (
    <>
      <div className="mr-2 flex items-center gap-1.5">
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="全部"
          count={records.length}
        />
        <FilterPill active={filter === "notes"} onClick={() => setFilter("notes")} label="有笔记" />
        <span className="flex-1" />
        {PICKABLE_COLORS.map(color => (
          <button
            key={color}
            type="button"
            title={`只看${COLOR_SPECS[color].label}色`}
            aria-label={`只看${COLOR_SPECS[color].label}色`}
            aria-pressed={filter === color}
            onClick={() => setFilter(filter === color ? "all" : color)}
            className={cn(
              "size-3 shrink-0 rounded-full",
              COLOR_SPECS[color].swatch,
              filter === color && "ring-accent ring-2 ring-offset-1"
            )}
          />
        ))}
      </div>
      {records.length === 0 ? (
        <Empty>
          选中文字即可高亮或写笔记
          <br />
          按住 Alt 拖动可框选区域
        </Empty>
      ) : list.length === 0 ? (
        <Empty>没有符合条件的标注</Empty>
      ) : (
        <ScrollBody>
          <div className="flex flex-col gap-0.5">
            {list.map(record => {
              const spec = COLOR_SPECS[annotationColor(record)];
              const style = record.type === "area" ? null : markupStyleOf(record.annotation);
              const note = noteText(record);
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onJumpAnnotation(record)}
                  className={cn(
                    "rounded-tau-sm ease-tau-out flex w-full flex-col gap-1 px-2 py-2 text-left transition-colors duration-[160ms]",
                    record.id === activeRecordId ? "bg-selected" : "hover:bg-hover"
                  )}
                >
                  <span
                    className={cn(
                      "text-tau-sm text-ink-1 line-clamp-3 border-l-[3px] pl-2 leading-relaxed",
                      spec.border
                    )}
                  >
                    {annotationSnippet(record)}
                  </span>
                  {note && (
                    <span className="text-tau-meta text-ink-2 flex gap-1.5 pl-0.5">
                      <MessageSquareText
                        size={12}
                        strokeWidth={1.75}
                        className="mt-[3px] shrink-0"
                      />
                      <span className="line-clamp-2">{note}</span>
                    </span>
                  )}
                  <span className="text-tau-meta text-ink-3 pl-0.5 tabular-nums">
                    第 {annotationPage(record)} 页
                    {style && style !== "highlight" ? ` · ${STYLE_LABEL[style]}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollBody>
      )}
    </>
  );
}

function BookmarkList({ bookmarks, onJumpPage, onRemoveBookmark }: LeftPanelProps) {
  const rows = useMemo(
    () =>
      bookmarks
        .map(bookmark => ({ bookmark, page: bookmarkPage(bookmark) }))
        .sort((a, b) => (a.page ?? 0) - (b.page ?? 0)),
    [bookmarks]
  );
  if (rows.length === 0) {
    return <Empty>悬停页面右上角点书签图标，或按 B 给当前页加书签</Empty>;
  }
  return (
    <ScrollBody>
      {rows.map(({ bookmark, page }) => (
        <div
          key={bookmark.id}
          className="rounded-tau-sm group/mark hover:bg-hover ease-tau-out flex items-center transition-colors duration-[160ms]"
        >
          <button
            type="button"
            onClick={() => page != null && onJumpPage(page)}
            className="text-tau-sm text-ink-1 flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left"
          >
            <Bookmark
              size={13}
              strokeWidth={1.75}
              className="text-accent shrink-0"
              fill="currentColor"
            />
            <span className="min-w-0 flex-1 truncate">{bookmark.bookmark.title}</span>
            {page != null && (
              <span className="text-tau-meta text-ink-3 shrink-0 tabular-nums">第 {page} 页</span>
            )}
          </button>
          {/* 删除占固定槽位、悬停淡入，不顶开行宽 */}
          <button
            type="button"
            title="删除书签"
            aria-label="删除书签"
            onClick={() => onRemoveBookmark(bookmark)}
            className="text-ink-3 hover:text-ink-1 grid size-7 shrink-0 place-items-center opacity-0 transition-opacity group-hover/mark:opacity-100"
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </ScrollBody>
  );
}
