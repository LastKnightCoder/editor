import { useState, type ReactNode } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type WebAnnotation,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import { cn, toast } from "@tau/ui";
import { HIGHLIGHT_HEX } from "../../content/page/highlights";
import { formatTime, openPage } from "../helpers";

export function SiteMark({ host, className }: { host: string; className?: string }) {
  const letter =
    host
      .replace(/^www\./, "")
      .charAt(0)
      .toUpperCase() || "·";
  return (
    <span
      aria-hidden
      className={cn(
        "bg-accent-soft text-accent-text text-tau-tiny rounded-tau-sm grid size-4 flex-none place-items-center font-semibold",
        className
      )}
    >
      {letter}
    </span>
  );
}

export function Dot({ color, size = 8 }: { color: HighlightColor; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block flex-none rounded-full"
      style={{ width: size, height: size, background: HIGHLIGHT_HEX[color] }}
    />
  );
}

/** 各色标注的占比 */
export function ColorBar({ colors, count }: Pick<WebPageSummary, "colors" | "count">) {
  return (
    <span className="bg-line-1 inline-flex h-[5px] w-[46px] flex-none overflow-hidden rounded-full">
      {HIGHLIGHT_COLORS.map(color =>
        colors[color] ? (
          <i
            key={color}
            className="block h-full"
            style={{
              width: `${(colors[color] / count) * 100}%`,
              background: HIGHLIGHT_HEX[color],
            }}
          />
        ) : null
      )}
    </span>
  );
}

export function Badge({ tone, children }: { tone: "warn" | "ok"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "text-tau-tiny rounded-tau-sm px-1.5 leading-4",
        tone === "warn" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"
      )}
    >
      {children}
    </span>
  );
}

/** 一条标注：色条 + 原文 + 批注；悬停出现「在原页定位」「复制」 */
export function AnnotationItem({
  url,
  item,
  footer,
}: {
  url: string;
  item: WebAnnotation;
  footer?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard
      .writeText(item.note ? `${item.text}\n\n${item.note}` : item.text)
      .then(() => {
        setCopied(true);
        toast.success("已复制");
      });
  return (
    <div className="group hover:bg-surface-hover rounded-tau-sm -mx-2.5 flex gap-3 px-2.5 py-3">
      <span
        className="w-[3px] flex-none rounded-sm"
        style={{ background: HIGHLIGHT_HEX[item.color] }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-tau-body-lg text-ink-1 font-serif whitespace-pre-wrap">{item.text}</p>
        {item.note && (
          <p className="bg-page text-tau-meta text-ink-2 rounded-tau-sm mt-1.5 px-2.5 py-1.5 whitespace-pre-wrap">
            {item.note}
          </p>
        )}
        <div className="text-tau-sm text-ink-3 mt-1.5 flex items-center gap-3">
          {footer ?? <span>{formatTime(item.createdAt)}</span>}
          <span className="flex gap-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => openPage(url, item.id)}
              className="text-accent-text inline-flex items-center gap-0.5 hover:underline"
            >
              在原页定位
              <ArrowUpRight size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={copy}
              className="hover:text-ink-1 inline-flex items-center gap-1"
            >
              <Copy size={12} strokeWidth={1.8} />
              {copied ? "已复制" : "复制"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="text-tau-meta text-ink-3 flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon}
      {children}
    </div>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="text-tau-sm text-ink-2 hover:bg-hover rounded-tau-sm my-2 w-full py-2"
    >
      {loading ? "正在加载…" : "加载更多"}
    </button>
  );
}
