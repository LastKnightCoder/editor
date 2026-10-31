import { useState, type MouseEvent, type ReactNode } from "react";
import { useReadOnly, useSlateStatic } from "slate-react";
import { Copy, ExternalLink, Globe, MoreHorizontal, Pencil, WifiOff } from "lucide-react";
import { cn } from "@tau/ui";
import {
  useElementFrame,
  useNotifier,
  useOptionalService,
  useTouchInteraction,
  type ElementRenderProps,
} from "@tau/editor/api";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

import type { BookmarkElement } from "../types";
import { bookmarkDisplay } from "../display";
import { fetchBookmarkMeta, useBookmarkLoading } from "../operations";
import { useOpenLink } from "../openLink";
import { openBookmarkEditor } from "./openBookmarkEditor";

const isRemote = (url: string) => /^https?:\/\//i.test(url);

/**
 * 先用存储后的地址，加载失败退回网站原地址，再失败不显示。
 * 本地路径交给宿主图片插槽解析；网络地址用原生 img 并不带 Referer，减少防盗链拦截。
 */
function FallbackImage({
  sources,
  className,
  fallback = null,
}: {
  sources: (string | undefined)[];
  className?: string;
  fallback?: ReactNode;
}) {
  const slots = useOptionalService(IEditorSlots);
  const list = sources.filter((value): value is string => !!value);
  const [index, setIndex] = useState(0);
  const url = list[index];
  if (!url) return <>{fallback}</>;
  const onError = () => setIndex(value => value + 1);
  const Image = slots?.Image;
  return Image && !isRemote(url) ? (
    <Image
      key={url}
      url={url}
      alt=""
      className={className}
      onLoadError={onError}
      draggable={false}
    />
  ) : (
    <img
      key={url}
      src={url}
      alt=""
      className={className}
      referrerPolicy="no-referrer"
      onError={onError}
      draggable={false}
    />
  );
}

function SiteIcon({ icon, fallback, size }: { icon?: string; fallback?: string; size: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[4px]"
      style={{ width: size, height: size }}
    >
      <FallbackImage
        sources={[icon, fallback]}
        className="size-full object-contain"
        fallback={
          <Globe size={size - 3} strokeWidth={1.75} className="text-[var(--ed-text-tertiary)]" />
        }
      />
    </span>
  );
}

const Skeleton = ({ className }: { className?: string }) => (
  <span className={cn("block animate-pulse rounded-[5px] bg-[var(--ed-bg-press)]", className)} />
);

const OPS_BUTTON =
  "inline-flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent " +
  "text-[var(--ed-text-secondary)] hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]";

export default function BookmarkCard({ element }: ElementRenderProps<BookmarkElement>) {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const touch = useTouchInteraction();
  const frame = useElementFrame();
  const notifier = useNotifier();
  const openLink = useOpenLink();
  const loading = useBookmarkLoading(editor, element);
  const display = bookmarkDisplay(element);
  const appearance = element.appearance ?? "row";
  const failed = !loading && (!element.meta || element.meta.failed);
  const canRetry = failed && !readOnly && !!element.meta?.failed;

  // 编辑态触屏单击只选中，桌面与阅读态单击打开
  const onClick = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-bookmark-control]")) return;
    if (touch && !readOnly) return;
    openLink(element.url);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(element.url);
      notifier.success("已复制链接");
    } catch {
      notifier.error("复制失败");
    }
  };
  const retry = () => void fetchBookmarkMeta(editor, element);

  const icon = (
    <SiteIcon icon={display.icon} fallback={display.iconFallback} size={touch ? 14 : 16} />
  );
  const source = (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-[1.5] text-[var(--ed-text-tertiary)]">
      {icon}
      <span className="shrink-0 text-[var(--ed-text-secondary)]">{display.siteName}</span>
      {!touch && display.siteName !== display.address && (
        <span className="truncate">· {display.address}</span>
      )}
    </span>
  );
  const status = canRetry ? (
    <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--ed-text-tertiary)]">
      <WifiOff size={13} strokeWidth={1.75} />
      没能读取网页信息
      <button
        type="button"
        data-bookmark-control=""
        className="cursor-pointer rounded-[4px] border-none bg-transparent px-1 text-[12px] text-[var(--ed-accent-text)] hover:bg-[var(--ed-accent-soft)]"
        onClick={retry}
      >
        重试
      </button>
    </span>
  ) : null;

  const ops =
    !readOnly && !touch ? (
      <div
        data-bookmark-control=""
        className={cn(
          "absolute right-2 top-2 z-[2] flex gap-0.5 rounded-[8px] border border-[var(--ed-border)] bg-[var(--ed-bg-surface)] p-0.5 shadow-[var(--ed-shadow-lift)]",
          "pointer-events-none -translate-y-0.5 opacity-0 transition duration-150",
          "group-hover/bookmark:pointer-events-auto group-hover/bookmark:translate-y-0 group-hover/bookmark:opacity-100"
        )}
        onMouseDown={event => event.stopPropagation()}
      >
        <button
          type="button"
          title="打开"
          aria-label="打开"
          className={OPS_BUTTON}
          onClick={() => openLink(element.url)}
        >
          <ExternalLink size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="复制链接"
          aria-label="复制链接"
          className={OPS_BUTTON}
          onClick={copy}
        >
          <Copy size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="编辑"
          aria-label="编辑"
          className={OPS_BUTTON}
          onClick={() => openBookmarkEditor(editor, element)}
        >
          <Pencil size={14} strokeWidth={1.75} />
        </button>
        <span className="mx-0.5 my-1 w-px bg-[var(--ed-border)]" />
        <button
          type="button"
          title="更多"
          aria-label="更多"
          className={OPS_BUTTON}
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            frame?.openMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <MoreHorizontal size={14} strokeWidth={1.75} />
        </button>
      </div>
    ) : null;

  const shell = cn(
    "group/bookmark @container relative select-none",
    "overflow-hidden border border-[var(--ed-border)] bg-[var(--ed-bg-surface)] text-[var(--ed-text)]",
    "transition-colors duration-150 hover:bg-[var(--ed-bg-hover)]",
    touch ? "rounded-[12px]" : "rounded-[10px]",
    (!touch || readOnly) && "cursor-pointer"
  );
  const label = `打开网页：${display.title}`;

  if (appearance === "compact") {
    return (
      <div
        className={shell}
        role="link"
        aria-label={label}
        onClick={onClick}
        data-bookmark="compact"
      >
        <div className="flex h-[42px] items-center gap-2.5 px-3">
          {icon}
          {loading ? (
            <Skeleton className="h-3 w-1/2" />
          ) : (
            <span className="min-w-0 shrink truncate text-[13.5px] font-medium">
              {display.title}
            </span>
          )}
          <span className="min-w-0 truncate text-[12px] text-[var(--ed-text-tertiary)]">
            {display.host}
          </span>
          <ExternalLink
            size={14}
            strokeWidth={1.75}
            className="ml-auto shrink-0 text-[var(--ed-text-tertiary)]"
          />
        </div>
        {ops}
      </div>
    );
  }

  const coverTop = appearance === "cover" && !!display.image && !touch;
  const text = (
    <div
      className={cn("flex min-w-0 flex-1 flex-col gap-[3px]", touch ? "" : "px-4 pb-[11px] pt-3")}
    >
      {loading ? (
        <>
          <Skeleton className="mt-[3px] mb-1.5 h-3.5 w-3/5" />
          <Skeleton className="h-[11px] w-11/12" />
          <Skeleton className="mt-1 h-[11px] w-2/3" />
        </>
      ) : (
        <>
          <span
            className={cn(
              "font-medium leading-[1.45]",
              touch ? "line-clamp-2 text-[14.5px]" : "truncate text-[14px]",
              display.bare && "break-all"
            )}
          >
            {display.title}
          </span>
          {status ??
            (display.description && (
              <span
                className={cn(
                  "text-[12.5px] leading-[1.55] text-[var(--ed-text-secondary)]",
                  touch || coverTop ? "truncate" : "line-clamp-2"
                )}
              >
                {display.description}
              </span>
            ))}
        </>
      )}
      <span className="mt-auto pt-1">{source}</span>
    </div>
  );

  const cover =
    loading && !touch ? (
      <span className="w-[34%] max-w-[220px] min-w-[120px] shrink-0 border-l border-[var(--ed-border)] bg-[var(--ed-bg-hover)] @max-[22.5rem]:hidden" />
    ) : display.image ? (
      <FallbackImage
        sources={[display.image, display.imageFallback]}
        className={cn(
          "shrink-0 object-cover",
          touch
            ? "size-[76px] rounded-[8px]"
            : coverTop
              ? "aspect-[1.91] w-full border-b border-[var(--ed-border)]"
              : "w-[34%] min-w-[120px] max-w-[220px] border-l border-[var(--ed-border)] @max-[22.5rem]:hidden"
        )}
      />
    ) : null;

  return (
    <div
      className={cn(shell, coverTop && "max-w-[340px]")}
      role="link"
      aria-label={label}
      onClick={onClick}
      data-bookmark={coverTop ? "cover" : "row"}
    >
      <div
        className={cn(
          "flex",
          coverTop ? "flex-col" : touch ? "gap-3 py-[11px] pl-[13px] pr-[11px]" : "min-h-[104px]"
        )}
      >
        {coverTop && cover}
        {text}
        {!coverTop && cover}
      </div>
      {ops}
    </div>
  );
}
