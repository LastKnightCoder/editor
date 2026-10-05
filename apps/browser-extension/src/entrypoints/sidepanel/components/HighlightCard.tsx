import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import type { Annotation, Highlight, HighlightColor, HighlightStyle } from "../../../content/types";
import {
  HIGHLIGHT_BG_COLORS,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_ORDER,
} from "../../../content/types";
import { formatRelativeTime, scrollToHighlight } from "../../../hooks/usePageHighlights";

const STYLE_LIST: HighlightStyle[] = ["marker", "straight", "wavy", "dashed"];

/** 引文按高亮本身的样式渲染（颜色是用户选的，原样使用，不走主题） */
function quoteStyle(style: HighlightStyle, color: HighlightColor): React.CSSProperties {
  if (style === "marker") {
    return { backgroundColor: HIGHLIGHT_BG_COLORS[color], borderRadius: 3, padding: "1px 3px" };
  }
  const line: Record<
    Exclude<HighlightStyle, "marker">,
    React.CSSProperties["textDecorationStyle"]
  > = { straight: "solid", wavy: "wavy", dashed: "dashed" };
  return {
    textDecorationLine: "underline",
    textDecorationStyle: line[style],
    textDecorationColor: HIGHLIGHT_COLORS[color],
    textUnderlineOffset: "3px",
    textDecorationThickness: style === "dashed" ? "1.5px" : "2px",
  };
}

function StyleIcon({ style }: { style: HighlightStyle }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (style) {
    case "marker":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    case "wavy":
      return (
        <svg {...common}>
          <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      );
    case "straight":
      return (
        <svg {...common}>
          <path d="M2 17h20" />
        </svg>
      );
    case "dashed":
      return (
        <svg {...common} strokeDasharray="4 3">
          <path d="M2 17h20" />
        </svg>
      );
  }
}

interface HighlightCardProps {
  highlight: Highlight;
  annotation?: Annotation;
  /** 紧凑：本页流里的预览（两行引文、一行想法，只能定位）；完整：可改颜色 / 样式 / 想法 */
  compact?: boolean;
  onColorChange?: (color: HighlightColor) => void;
  onStyleChange?: (style: HighlightStyle) => void;
  onDelete?: () => void;
  onSaveAnnotation?: (text: string) => void;
}

export function HighlightCard({
  highlight,
  annotation,
  compact = false,
  onColorChange,
  onStyleChange,
  onDelete,
  onSaveAnnotation,
}: HighlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(annotation?.text ?? "");
    setEditing(true);
  };
  const save = () => {
    onSaveAnnotation?.(draft);
    setEditing(false);
  };

  return (
    <div className="group/hl relative flex gap-2.5 py-2.5 pl-3 pr-2.5">
      <span
        aria-hidden
        className="w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: HIGHLIGHT_COLORS[highlight.color] }}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          title="在网页中定位"
          onClick={() => void scrollToHighlight(highlight.id)}
          className={cn(
            "text-ink-1 block w-full text-left leading-[1.7]",
            compact ? "text-tau-body line-clamp-2" : "text-tau-body-lg"
          )}
        >
          <span style={quoteStyle(highlight.style, highlight.color)}>{highlight.range.text}</span>
        </button>

        {annotation && compact && (
          <p className="text-tau-meta text-ink-2 mt-1 line-clamp-1 leading-[1.6]">
            {annotation.text}
          </p>
        )}
        {annotation && !compact && !editing && (
          <button
            type="button"
            title="编辑想法"
            onClick={startEdit}
            className="text-tau-meta text-ink-2 hover:text-ink-1 mt-1 block w-full text-left leading-[1.6]"
          >
            {annotation.text}
          </button>
        )}

        {!compact && editing && (
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              autoFocus
              rows={2}
              value={draft}
              placeholder="写下你的想法"
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  save();
                }
                if (event.key === "Escape") setEditing(false);
              }}
              className="border-line-1 bg-surface text-tau-body text-ink-1 placeholder:text-ink-3 focus:border-accent rounded-tau-sm w-full resize-none border px-2.5 py-1.5 leading-[1.6] outline-none"
            />
            <div className="text-tau-tiny text-ink-3 flex items-center gap-2">
              Enter 保存 · Esc 取消
              <span className="flex-1" />
              <button type="button" className="hover:text-ink-1" onClick={() => setEditing(false)}>
                取消
              </button>
              <button type="button" className="text-accent-text font-medium" onClick={save}>
                保存
              </button>
            </div>
          </div>
        )}

        {!compact && (
          <div className="text-tau-tiny text-ink-3 mt-1.5 flex h-6 items-center gap-1">
            <span>{formatRelativeTime(highlight.createdAt)}</span>
            <span className="flex-1" />
            <div
              className={cn(
                "flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/hl:opacity-100",
                expanded && "opacity-100"
              )}
            >
              {!annotation && !editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="hover:bg-hover hover:text-ink-1 flex h-6 items-center gap-1 rounded-[6px] px-1.5"
                >
                  <MessageSquare size={12} strokeWidth={1.75} />
                  写想法
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpanded(value => !value)}
                className={cn(
                  "hover:bg-hover hover:text-ink-1 flex h-6 items-center rounded-[6px] px-1.5",
                  expanded && "bg-hover text-ink-1"
                )}
              >
                样式
              </button>
              <IconButton
                aria-label="删除高亮"
                className="size-6 [&_svg]:size-3.5"
                onClick={onDelete}
              >
                <Trash2 />
              </IconButton>
            </div>
          </div>
        )}

        {!compact && expanded && (
          <div className="mt-1 flex items-center gap-1.5">
            {HIGHLIGHT_COLOR_ORDER.map(color => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => onColorChange?.(color)}
                className="grid size-6 place-items-center"
              >
                <span
                  className={cn(
                    "rounded-full transition-all",
                    highlight.color === color
                      ? "size-[18px] ring-2 ring-offset-1 ring-offset-[var(--tau-bg-surface)]"
                      : "size-3.5"
                  )}
                  style={{
                    backgroundColor: HIGHLIGHT_COLORS[color],
                    ["--tw-ring-color" as string]: HIGHLIGHT_COLORS[color],
                  }}
                />
              </button>
            ))}
            <span className="bg-line-1 mx-1 h-4 w-px" />
            {STYLE_LIST.map(style => (
              <button
                key={style}
                type="button"
                aria-label={style}
                onClick={() => onStyleChange?.(style)}
                className={cn(
                  "text-ink-3 hover:bg-hover grid h-7 w-8 place-items-center rounded-[7px]",
                  highlight.style === style && "bg-hover text-ink-1"
                )}
              >
                <StyleIcon style={style} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
