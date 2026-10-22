/**
 * 每页叠加层（随页面一起滚动、缩放）：页角书签、查找命中、跳转闪烁、区域标注框、页边（展开时）
 * 或页内笔记图钉（收起时）、新选区 / 框选 / 区域标注的浮动工具条、写笔记卡。文本标注的工具条由引擎的 selectionMenu 承载
 * （见 AnnotationMenu）。坐标一律是 PDF 坐标 × scale。
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Rect } from "@embedpdf/models";
import { Bookmark, MessageSquareText } from "lucide-react";
import { cn } from "@tau/ui";
import type { PdfAnnotation } from "@/types";
import {
  COLOR_SPECS,
  annotationColor,
  annotationPage,
  annotationRect,
  annotationSnippet,
  hasNote,
  layoutPins,
  noteText,
} from "../annotationModel";
import type { PaperPalette } from "../paper";
import { overlayProps, useReader } from "../readerContext";
import { FloatToolbar } from "./FloatToolbar";
import { ToolbarPluginActions } from "./PluginAnnotationActions";
import { MarginColumn } from "./MarginColumn";
import { NoteCard } from "./NoteCard";

interface PageLayerProps {
  pageIndex: number;
  scale: number;
  /** 页面显示宽高（已缩放，像素） */
  width: number;
  height: number;
  /** 本页纸色（页边着色用）；null = 未取到 */
  paper: PaperPalette | null;
}

const PIN_SIZE = 22;
const PIN_CARD_WIDTH = 260;
/** 离页顶不足这个距离时工具条放到下方 */
const ABOVE_MIN = 52;

const scaled = (rect: Rect, scale: number) => ({
  left: rect.origin.x * scale,
  top: rect.origin.y * scale,
  width: rect.size.width * scale,
  height: rect.size.height * scale,
});

const recordRect = (record: PdfAnnotation): Rect | null => {
  const r = annotationRect(record);
  return r ? { origin: { x: r.x, y: r.y }, size: { width: r.width, height: r.height } } : null;
};

/**
 * 把浮层挂在页内某个矩形的上方或下方，水平居中并夹在页宽之内（estimatedWidth 只用于夹边）。
 */
function Anchor({
  rect,
  scale,
  pageWidth,
  estimatedWidth,
  placement = "auto",
  children,
}: {
  rect: Rect;
  scale: number;
  pageWidth: number;
  estimatedWidth: number;
  placement?: "auto" | "below";
  children: ReactNode;
}) {
  const box = scaled(rect, scale);
  const below = placement === "below" || box.top < ABOVE_MIN;
  const half = estimatedWidth / 2;
  const center = box.left + box.width / 2;
  const clamped =
    pageWidth > estimatedWidth + 16
      ? Math.min(Math.max(center, half + 8), pageWidth - half - 8)
      : center;
  const style: CSSProperties = {
    left: clamped - box.left,
    ...(below ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
  };
  return (
    <div className="absolute" style={box}>
      <div
        {...overlayProps}
        className="pointer-events-auto absolute z-20 -translate-x-1/2"
        style={style}
      >
        {children}
      </div>
    </div>
  );
}

export function PageLayer({ pageIndex, scale, width, height, paper }: PageLayerProps) {
  const reader = useReader();
  const pageNumber = pageIndex + 1;
  const pageRecords = useMemo(
    () => reader.records.filter(record => annotationPage(record) === pageNumber),
    [reader.records, pageNumber]
  );
  const bookmarked = reader.bookmarkedPages.has(pageNumber);
  const overlay = reader.overlay;
  const hits = reader.searchHits.filter(h => h.pageIndex === pageIndex);
  const flash = reader.flash?.pageIndex === pageIndex ? reader.flash : null;
  const marginOpen = reader.marginWidth > 0;
  // 页边展开时写笔记卡由页边承载
  const note = !marginOpen && reader.noteTarget?.pageIndex === pageIndex ? reader.noteTarget : null;
  const noteRecord = note
    ? (reader.records.find(r => r.annotation.id === note.objectId) ?? null)
    : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]">
      {/* 页角书签：悬停页面出现，已加书签常显 */}
      <button
        {...overlayProps}
        type="button"
        title={bookmarked ? "移除书签 (B)" : "加书签 (B)"}
        aria-label={bookmarked ? "移除书签" : "加书签"}
        aria-pressed={bookmarked}
        onClick={() => reader.toggleBookmark(pageNumber)}
        className={cn(
          "rounded-tau-sm ease-tau-out pointer-events-auto absolute right-2 top-2 grid size-7 place-items-center transition-[opacity,background] duration-[160ms]",
          bookmarked
            ? "text-accent opacity-100"
            : "text-ink-3 hover:bg-hover hover:text-ink-2 opacity-0 group-hover/page:opacity-100"
        )}
      >
        <Bookmark size={16} strokeWidth={1.75} fill={bookmarked ? "currentColor" : "none"} />
      </button>

      {hits.flatMap((hit, i) =>
        hit.rects.map((rect, j) => {
          const current =
            reader.currentHit?.pageIndex === pageIndex &&
            reader.currentHit.rect.origin.x === rect.origin.x &&
            reader.currentHit.rect.origin.y === rect.origin.y;
          return (
            <div
              key={`${i}-${j}`}
              className={cn(
                "absolute rounded-[2px]",
                current ? "bg-accent/45 ring-accent ring-1" : "bg-accent/20"
              )}
              style={scaled(rect, scale)}
            />
          );
        })
      )}

      {flash?.rects.map((rect, i) => (
        <div
          key={i}
          className="bg-info/25 ring-info/50 absolute rounded-[3px] ring-2"
          style={scaled(rect, scale)}
        />
      ))}

      {pageRecords
        .filter(record => record.type === "area")
        .map(record => (
          <AreaBox key={record.id} record={record} scale={scale} />
        ))}

      {marginOpen ? (
        <MarginColumn
          pageIndex={pageIndex}
          scale={scale}
          height={height}
          paper={paper}
          records={pageRecords}
        />
      ) : (
        <NotePins records={pageRecords.filter(hasNote)} scale={scale} />
      )}

      {overlay?.kind === "selection" && overlay.pageIndex === pageIndex && (
        <Anchor rect={overlay.rect} scale={scale} pageWidth={width} estimatedWidth={400}>
          <FloatToolbar
            mode="selection"
            markupStyle={reader.newStyle}
            canAsk={reader.canAsk}
            onColor={reader.markSelection}
            onToggleStyle={reader.toggleNewStyle}
            onNote={reader.noteSelection}
            onAsk={reader.askSelection}
            onCopy={reader.copySelection}
          />
        </Anchor>
      )}

      {/* 刚框选的区域：引擎松手即清掉自己的框，这里画回来，直到存为标注或关闭工具条 */}
      {overlay?.kind === "area-new" && overlay.pageIndex === pageIndex && (
        <div
          aria-hidden
          className="border-accent bg-accent/10 rounded-tau-sm absolute border-2 border-dashed"
          style={scaled(overlay.rect, scale)}
        />
      )}

      {overlay?.kind === "area-new" && overlay.pageIndex === pageIndex && (
        <Anchor
          rect={overlay.rect}
          scale={scale}
          pageWidth={width}
          estimatedWidth={320}
          placement="below"
        >
          <FloatToolbar
            mode="area-new"
            canAsk={reader.canAsk}
            onSaveArea={reader.saveNewArea}
            onAsk={reader.askNewArea}
            onCopy={reader.copyNewArea}
          />
        </Anchor>
      )}

      {overlay?.kind === "area" &&
        pageRecords
          .filter(record => record.id === overlay.recordId)
          .map(record => {
            const rect = recordRect(record);
            if (!rect) return null;
            return (
              <Anchor
                key={record.id}
                rect={rect}
                scale={scale}
                pageWidth={width}
                estimatedWidth={360}
              >
                <FloatToolbar
                  mode="area"
                  color={annotationColor(record)}
                  hasNote={hasNote(record)}
                  canAsk={reader.canAsk}
                  onColor={color => reader.recolor(record, color)}
                  onNote={() => reader.openNote(record)}
                  onAsk={() => reader.ask(record)}
                  onCopy={() => reader.copy(record)}
                  onDelete={() => reader.remove(record)}
                  extra={<ToolbarPluginActions recordId={record.id} />}
                />
              </Anchor>
            );
          })}

      {note && (
        <Anchor
          rect={note.rect}
          scale={scale}
          pageWidth={width}
          estimatedWidth={340}
          placement="below"
        >
          <NoteCard
            key={note.objectId ?? "draft"}
            record={noteRecord}
            onSave={notes => (noteRecord ? reader.saveNote(noteRecord, notes) : Promise.resolve())}
            onCancel={reader.closeNote}
          />
        </Anchor>
      )}
    </div>
  );
}

function AreaBox({ record, scale }: { record: PdfAnnotation; scale: number }) {
  const reader = useReader();
  const rect = recordRect(record);
  if (!rect) return null;
  const color = COLOR_SPECS[annotationColor(record)];
  const selected = reader.overlay?.kind === "area" && reader.overlay.recordId === record.id;
  return (
    <button
      {...overlayProps}
      type="button"
      aria-label={`区域标注 · 第 ${annotationPage(record)} 页`}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={() => reader.selectArea(selected ? null : record.id)}
      className={cn(
        "rounded-tau-sm pointer-events-auto absolute cursor-pointer border-2",
        color.border,
        color.areaFill,
        selected && "ring-accent ring-2 ring-offset-1"
      )}
      style={scaled(rect, scale)}
    />
  );
}

/** 页边笔记图钉：悬停浮出笔记卡，点击钉住（再点或点别处取消） */
function NotePins({ records, scale }: { records: PdfAnnotation[]; scale: number }) {
  const reader = useReader();
  const [hovered, setHovered] = useState<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const slots = useMemo(() => layoutPins(records, scale, PIN_SIZE), [records, scale]);

  const cancelHide = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setHovered(null), 160);
  };
  useEffect(() => cancelHide, []);

  if (slots.length === 0) return null;
  const openId = reader.pinned ?? hovered;

  return (
    <>
      {slots.map(({ record, top }) => {
        const spec = COLOR_SPECS[annotationColor(record)];
        const on = reader.pinned === record.id;
        return (
          <button
            {...overlayProps}
            key={record.id}
            type="button"
            title="悬停查看笔记，点击钉住"
            aria-label={`笔记 · ${annotationSnippet(record)}`}
            aria-pressed={on}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onMouseEnter={() => {
              cancelHide();
              setHovered(record.id);
            }}
            onMouseLeave={scheduleHide}
            onClick={() => reader.setPinned(on ? null : record.id)}
            className={cn(
              "rounded-tau-sm ease-tau-out pointer-events-auto absolute right-2.5 grid place-items-center transition-shadow duration-[160ms]",
              spec.text,
              "bg-surface/80 hover:ring-1 hover:ring-current",
              on && "ring-1 ring-current",
              reader.flashPin === record.id && "ring-2 ring-current"
            )}
            style={{ top, width: PIN_SIZE, height: PIN_SIZE }}
          >
            <span
              aria-hidden
              className={cn("rounded-tau-sm absolute inset-0 opacity-20", spec.swatch)}
            />
            <MessageSquareText size={13} strokeWidth={1.9} className="relative" />
          </button>
        );
      })}
      {slots
        .filter(slot => slot.record.id === openId)
        .map(({ record, top }) => (
          <PinCard
            key={record.id}
            record={record}
            top={top}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          />
        ))}
    </>
  );
}

function PinCard({
  record,
  top,
  onMouseEnter,
  onMouseLeave,
}: {
  record: PdfAnnotation;
  top: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const reader = useReader();
  const spec = COLOR_SPECS[annotationColor(record)];
  return (
    <div
      {...overlayProps}
      role="note"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "bg-surface shadow-float rounded-tau-md text-tau-sm text-ink-1 pointer-events-auto absolute z-20 border-l-[3px] px-2.5 py-2",
        spec.border
      )}
      style={{ top: top - 4, right: 40, width: PIN_CARD_WIDTH }}
    >
      <div className="text-tau-meta text-ink-3 truncate">{annotationSnippet(record)}</div>
      <div className="mt-0.5 line-clamp-6 whitespace-pre-wrap leading-relaxed">
        {noteText(record)}
      </div>
      <div className="text-tau-meta text-ink-3 mt-1.5 flex items-center gap-2">
        <span className="tabular-nums">第 {annotationPage(record)} 页</span>
        <span className="flex-1" />
        <button
          type="button"
          className="hover:text-ink-1 rounded-tau-sm px-1"
          onClick={() => {
            reader.setPinned(null);
            reader.openNote(record);
          }}
        >
          编辑
        </button>
        <button
          type="button"
          className="hover:text-danger rounded-tau-sm px-1"
          onClick={() => reader.clearNote(record)}
        >
          删除笔记
        </button>
      </div>
    </div>
  );
}
