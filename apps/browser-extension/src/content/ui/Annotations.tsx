import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, PenLine, Sparkles, Trash2 } from "lucide-react";
import type { WebAnnotation } from "@tau/shared/browser-companion";
import { Button, IconButton } from "@tau/ui";
import { findContentRoot } from "../page/extract";
import { HIGHLIGHT_HEX } from "../page/highlights";
import { useCompanion } from "../state/store";
import { useController, useEscLayer } from "./context";

const MARKER = 20;
const CARD_WIDTH = 248;

const relativeTime = (time: number) => {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
};

/** 批注编辑：贴在高亮下方，⌘↵ 保存 */
export function NoteEditor() {
  const controller = useController();
  const id = useCompanion(state => state.editingNoteId);
  const item = useCompanion(state => state.annotations.find(annotation => annotation.id === id));
  const layout = useCompanion(state => state.layoutVersion);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const close = () => useCompanion.setState({ editingNoteId: null });
  useEscLayer(Boolean(item), close);

  useEffect(() => {
    setValue(item?.note ?? "");
    if (item) setTimeout(() => ref.current?.focus(), 0);
    // 只在切换编辑对象时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const rect = useMemo(
    () => (item ? controller.annotations.rangeOf(item.id)?.getBoundingClientRect() : null),
    [controller, item, layout]
  );
  if (!item || !rect) return null;
  const left = Math.max(12, Math.min(innerWidth - 312, rect.left));
  const top = Math.min(innerHeight - 170, rect.bottom + 10);
  const save = () => controller.saveNoteOf(item.id, value);

  return (
    <div
      className="bg-surface shadow-float animate-tau-pop rounded-tau-md fixed z-[41] w-[300px] p-3"
      style={{ left, top }}
    >
      <p className="text-tau-sm text-ink-3 border-line-1 mb-2 line-clamp-2 border-l-2 pl-2">
        {item.text}
      </p>
      <textarea
        ref={ref}
        rows={3}
        value={value}
        placeholder="写下你的想法…"
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save();
        }}
        className="bg-surface text-ink-1 placeholder:text-ink-3 border-line-1 focus:border-accent rounded-tau-sm block w-full resize-none border px-2.5 py-2 outline-none focus:shadow-[var(--tau-focus-ring)]"
      />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="text-tau-tiny text-ink-3 border-line-1 mr-auto rounded-[5px] border px-1.5 font-mono">
          ⌘↵ 保存
        </span>
        <Button size="sm" variant="ghost" onClick={close}>
          取消
        </Button>
        <Button size="sm" variant="primary" onClick={save}>
          保存
        </Button>
      </div>
    </div>
  );
}

/**
 * 页边批注标记：带批注的高亮在正文列右侧留一枚小标记（与高亮同色），垂直对齐高亮首行，
 * 不占阅读宽度；悬停浮出批注，点击钉住。正文贴满视口时标记退到高亮行尾。
 */
export function MarginMarkers() {
  const controller = useController();
  const annotations = useCompanion(state => state.annotations);
  const layout = useCompanion(state => state.layoutVersion);
  const pinned = useCompanion(state => state.pinnedNoteId);
  const hover = useCompanion(state => state.hoverNoteId);
  const side = useCompanion(state => state.side);
  useEscLayer(Boolean(pinned), () => useCompanion.setState({ pinnedNoteId: null }));

  // 正文容器只在标注集合变化时重找（每帧滚动只读它的位置）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contentRoot = useMemo(() => findContentRoot(document), [annotations.length]);
  const markers = useMemo(() => {
    const rootRight = contentRoot.getBoundingClientRect().right;
    // 右缘留出悬浮球的位置
    const maxX = innerWidth - (side === "right" ? 56 : 16) - MARKER;
    return annotations
      .filter(item => item.note)
      .map(item => {
        const range = controller.annotations.rangeOf(item.id);
        const rects = range ? [...range.getClientRects()] : [];
        if (!rects.length) return null;
        const first = rects[0];
        const inMargin = rootRight + 12 <= maxX;
        const x = inMargin ? rootRight + 12 : Math.min(maxX, rects.at(-1)!.right + 4);
        const y = inMargin ? first.top + first.height / 2 - MARKER / 2 : rects.at(-1)!.top - 8;
        if (y < -MARKER || y > innerHeight) return null;
        return { item, x, y };
      })
      .filter(Boolean) as Array<{ item: WebAnnotation; x: number; y: number }>;
    // layoutVersion 驱动重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, layout, side, controller, contentRoot]);

  const shown = markers.find(marker => marker.item.id === (pinned ?? hover));

  return (
    <>
      {markers.map(({ item, x, y }) => {
        const hex = HIGHLIGHT_HEX[item.color];
        return (
          <button
            key={item.id}
            type="button"
            aria-label="查看批注"
            onMouseEnter={() => useCompanion.setState({ hoverNoteId: item.id })}
            onMouseLeave={() => useCompanion.setState({ hoverNoteId: null })}
            onClick={() =>
              useCompanion.setState(state => ({
                pinnedNoteId: state.pinnedNoteId === item.id ? null : item.id,
              }))
            }
            className="fixed z-20 grid size-5 place-items-center rounded-md"
            style={{
              left: x,
              top: y,
              background: `color-mix(in srgb, ${hex} 22%, var(--tau-bg-surface))`,
              color: `color-mix(in srgb, ${hex} 85%, var(--tau-ink-1))`,
              boxShadow: `0 0 0 ${pinned === item.id ? 1.5 : 1}px color-mix(in srgb, ${hex} ${pinned === item.id ? 100 : 35}%, transparent)`,
            }}
          >
            <MessageSquareText size={12} strokeWidth={2.2} />
          </button>
        );
      })}
      {shown && <NoteCard item={shown.item} x={shown.x} y={shown.y} />}
    </>
  );
}

function NoteCard({ item, x, y }: { item: WebAnnotation; x: number; y: number }) {
  const controller = useController();
  const roomRight = x + MARKER + 8 + CARD_WIDTH < innerWidth - 12;
  return (
    <div
      onMouseEnter={() => useCompanion.setState({ hoverNoteId: item.id })}
      onMouseLeave={() => useCompanion.setState({ hoverNoteId: null })}
      className="bg-surface shadow-float animate-tau-pop rounded-tau-md fixed z-[21] px-3 py-2.5"
      style={{
        width: CARD_WIDTH,
        top: Math.max(8, y - 6),
        left: roomRight ? x + MARKER + 8 : x - CARD_WIDTH - 8,
      }}
    >
      <p className="text-ink-1 whitespace-pre-wrap">{item.note}</p>
      <div className="text-tau-sm text-ink-3 mt-1.5 flex items-center gap-0.5">
        <span className="mr-auto">批注 · {relativeTime(item.createdAt)}</span>
        <IconButton
          aria-label="编辑批注"
          className="size-6"
          onClick={() =>
            useCompanion.setState({ editingNoteId: item.id, pinnedNoteId: null, hoverNoteId: null })
          }
        >
          <PenLine size={14} strokeWidth={1.8} />
        </IconButton>
        <IconButton
          aria-label="问 AI"
          className="size-6"
          onClick={() => {
            useCompanion.setState(state => ({
              pinnedNoteId: null,
              hoverNoteId: null,
              chat: { ...state.chat, quote: { text: item.text, block: null } },
            }));
            controller.openPanel("chat");
          }}
        >
          <Sparkles size={14} strokeWidth={1.8} />
        </IconButton>
        <IconButton
          aria-label="删除标注"
          className="size-6"
          onClick={() => controller.removeAnnotation(item.id)}
        >
          <Trash2 size={14} strokeWidth={1.8} />
        </IconButton>
      </div>
    </div>
  );
}
