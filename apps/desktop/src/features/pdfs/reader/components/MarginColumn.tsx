/**
 * 页边（页面右侧、与页面同一张纸，虚线隔开；颜色取 PDF 纸色，取不到时用主题色）：本页笔记按锚点高度常显，超过 4 行折叠；
 * 点笔记就地弹写笔记卡，点空白处在该高度写页边批注。悬停笔记时给原文标注描边。
 * 排不下的笔记不显示，底部给出条数，点开左侧标注列表。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { cn } from "@tau/ui";
import type { PdfAnnotation } from "@/types";
import {
  COLOR_SPECS,
  annotationColor,
  annotationRect,
  hasNote,
  isMarginNote,
  layoutMarginNotes,
  noteText,
  sortAnnotations,
} from "../annotationModel";
import type { PaperPalette } from "../paper";
import { overlayProps, useReader } from "../readerContext";
import { useReaderPrefs } from "../readerPrefs";
import { NoteCard } from "./NoteCard";

interface MarginColumnProps {
  pageIndex: number;
  scale: number;
  /** 页面显示高度（已缩放，像素） */
  height: number;
  paper: PaperPalette | null;
  records: PdfAnnotation[];
}

/** 未测到高度前按两行估算 */
const ESTIMATED_NOTE_HEIGHT = 44;
/** 写笔记卡的大致高度：靠近页底时上移，免得压到下一页 */
const CARD_HEIGHT = 230;

/** 页边着色经这组变量：有纸色用纸色推出的颜色，否则回到主题 token */
function marginVars(paper: PaperPalette | null): CSSProperties {
  return {
    "--margin-ink": paper?.ink ?? "var(--tau-ink-2)",
    "--margin-ink-strong": paper?.inkStrong ?? "var(--tau-ink-1)",
    "--margin-muted": paper?.muted ?? "var(--tau-ink-3)",
    "--margin-line": paper?.line ?? "var(--tau-line-1)",
    "--margin-hover": paper?.hover ?? "var(--tau-bg-hover)",
  } as CSSProperties;
}

export function MarginColumn({ pageIndex, scale, height, paper, records }: MarginColumnProps) {
  const reader = useReader();
  const setLeftTab = useReaderPrefs(s => s.setLeftTab);
  const notes = useMemo(() => sortAnnotations(records.filter(hasNote)), [records]);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [hovered, setHovered] = useState<number | null>(null);
  const [ghostY, setGhostY] = useState<number | null>(null);

  const observer = useMemo(
    () =>
      new ResizeObserver(entries =>
        setHeights(prev => {
          let next = prev;
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            const id = Number(el.dataset.noteId);
            if (prev[id] === el.offsetHeight) continue;
            if (next === prev) next = { ...prev };
            next[id] = el.offsetHeight;
          }
          return next;
        })
      ),
    []
  );
  useEffect(() => () => observer.disconnect(), [observer]);
  const measure = useCallback(
    (el: HTMLElement | null) => {
      if (el) observer.observe(el);
    },
    [observer]
  );

  const anchorOf = (record: PdfAnnotation) => (annotationRect(record)?.y ?? 0) * scale;
  const { slots, hidden } = layoutMarginNotes(
    notes.map(record => ({
      id: record.id,
      anchor: anchorOf(record),
      height: heights[record.id] ?? ESTIMATED_NOTE_HEIGHT,
    })),
    height
  );
  const topOf = new Map(slots.map(slot => [slot.id, slot.top]));

  const target = reader.noteTarget?.pageIndex === pageIndex ? reader.noteTarget : null;
  const targetRecord = target?.objectId
    ? (reader.records.find(r => r.annotation.id === target.objectId) ?? null)
    : null;
  const cardTop = target
    ? Math.max(
        0,
        Math.min(
          (targetRecord ? topOf.get(targetRecord.id) : undefined) ?? target.rect.origin.y * scale,
          height - CARD_HEIGHT
        )
      )
    : 0;

  const hoveredRecord = notes.find(r => r.id === hovered && !isMarginNote(r));
  const hoveredRect = hoveredRecord ? annotationRect(hoveredRecord) : null;

  const onBlank = (e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget;

  return (
    <>
      {hoveredRecord && hoveredRect && (
        <div
          aria-hidden
          className={cn(
            "absolute rounded-[3px] ring-2 ring-current",
            COLOR_SPECS[annotationColor(hoveredRecord)].text
          )}
          style={{
            left: hoveredRect.x * scale - 2,
            top: hoveredRect.y * scale - 2,
            width: hoveredRect.width * scale + 4,
            height: hoveredRect.height * scale + 4,
          }}
        />
      )}
      <div
        {...overlayProps}
        role="region"
        aria-label={`第 ${pageIndex + 1} 页页边`}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onMouseMove={e => setGhostY(onBlank(e) ? e.nativeEvent.offsetY : null)}
        onMouseLeave={() => setGhostY(null)}
        onClick={e => {
          // 已有写笔记卡开着时不另起草稿，免得丢掉没保存的内容
          if (!onBlank(e) || reader.noteTarget) return;
          reader.draftMargin(pageIndex, e.nativeEvent.offsetY / scale);
          setGhostY(null);
        }}
        className="pointer-events-auto absolute inset-y-0 left-full cursor-text border-l border-dashed border-[var(--margin-line)]"
        style={{ ...marginVars(paper), width: reader.marginWidth }}
      >
        {notes.map(record => {
          const top = topOf.get(record.id);
          const margin = isMarginNote(record);
          return (
            <div
              key={record.id}
              ref={measure}
              data-note-id={record.id}
              role="button"
              tabIndex={top === undefined ? -1 : 0}
              aria-label={`笔记 · ${noteText(record)}`}
              onClick={() => reader.openNote(record)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) reader.openNote(record);
              }}
              onMouseEnter={() => setHovered(record.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "rounded-tau-sm text-tau-sm ease-tau-out absolute inset-x-2.5 py-0.5 pl-3 pr-1.5 leading-relaxed text-[var(--margin-ink)] transition-colors duration-[160ms] hover:bg-[var(--margin-hover)] hover:text-[var(--margin-ink-strong)]",
                top === undefined && "invisible",
                reader.pinned === record.id && "bg-selected text-[var(--margin-ink-strong)]",
                reader.flashPin === record.id && "ring-accent ring-1"
              )}
              style={{ top: top ?? anchorOf(record) }}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-1.5 left-1 top-1.5",
                  margin
                    ? "border-l-2 border-dotted border-[var(--margin-muted)]"
                    : cn("w-0.5 rounded-full", COLOR_SPECS[annotationColor(record)].swatch)
                )}
              />
              <span className="line-clamp-4 whitespace-pre-wrap break-words">
                {noteText(record)}
              </span>
            </div>
          );
        })}

        {ghostY !== null && !reader.noteTarget && (
          <span
            aria-hidden
            className="text-tau-meta pointer-events-none absolute left-5 text-[var(--margin-muted)]"
            style={{ top: ghostY - 9 }}
          >
            ＋ 写批注
          </span>
        )}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setLeftTab("anns")}
            className="text-tau-meta rounded-tau-sm absolute bottom-2 left-5 px-1 text-[var(--margin-muted)] hover:text-[var(--margin-ink-strong)]"
          >
            还有 {hidden} 条笔记
          </button>
        )}

        {target && (
          <div className="absolute right-2 z-20" style={{ top: cardTop }}>
            <NoteCard
              key={target.objectId ?? `draft-${target.rect.origin.y}`}
              record={targetRecord}
              draftPage={target.objectId === null ? pageIndex + 1 : undefined}
              onSave={notes =>
                targetRecord
                  ? reader.saveNote(targetRecord, notes)
                  : target.objectId === null
                    ? reader.saveMarginDraft(notes)
                    : Promise.resolve()
              }
              onCancel={reader.closeNote}
              onDelete={
                targetRecord && hasNote(targetRecord)
                  ? () => {
                      reader.closeNote();
                      reader.clearNote(targetRecord);
                    }
                  : undefined
              }
              onAsk={
                reader.canAsk && targetRecord && hasNote(targetRecord)
                  ? () => {
                      reader.closeNote();
                      reader.ask(targetRecord);
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </>
  );
}
