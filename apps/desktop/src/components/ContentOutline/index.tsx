/**
 * 正文公共目录：点击条目定位标题，滚动时同步高亮当前节。
 * 锚点解析协议：默认按 header.id 查 DOM；编辑器场景由调用方传 resolveAnchor
 * （按序索引编辑器实时 children，见 props 注释）。
 */

import { memo, useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import type { HeaderElement } from "@tau/editor/extensions/header";
export { resolveHeaderAnchor as resolveEditorHeaderAnchor } from "@tau/editor/extensions/header";
import { getInlineElementText } from "@/utils";
import { Tooltip, cn } from "@tau/ui";
import { locateOutlineHeader } from "./position";

export interface OutlineHeader {
  /** 标题锚点的 DOM id（默认解析方案用；编辑器方案仅作 React key） */
  id: string;
  level: number;
  title: string;
}

interface ContentOutlineProps {
  headers: OutlineHeader[];
  /** 滚动容器：高亮同步的观察根，也是点击定位的滚动目标 */
  scrollEl?: HTMLElement | null;
  /**
   * 锚点解析：默认按 id 查 DOM；编辑器场景按序索引实时 editor.children，
   * 避免用宿主投影快照中的节点引用解析 DOM。
   */
  resolveAnchor?: (header: OutlineHeader, index: number) => HTMLElement | null;
  /** 顶部「大纲」小标题（外层已有标题时关掉，如侧栏页签） */
  showTitle?: boolean;
  className?: string;
}

/** 从 Slate 正文提取标题结构（提取口径复刻 legacy EditorOutline） */
export function extractContentHeaders(
  content: readonly Descendant[] | null | undefined
): OutlineHeader[] {
  if (!content) return [];
  const headers = content.filter(
    node => (node as { type?: string }).type === "header"
  ) as HeaderElement[];
  return headers.map((header, index) => ({
    id: `content-h-${index}`,
    level: header.level,
    title: header.children.map(getInlineElementText).join(""),
  }));
}

export function ContentOutline({
  headers: incomingHeaders,
  scrollEl,
  resolveAnchor,
  showTitle = true,
  className,
}: ContentOutlineProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const previousHeaders = useRef<OutlineHeader[]>([]);
  const nextHeaders = incomingHeaders.map((header, index) => {
    const previous = previousHeaders.current[index];
    return previous &&
      previous.id === header.id &&
      previous.level === header.level &&
      previous.title === header.title
      ? previous
      : header;
  });
  if (
    nextHeaders.length !== previousHeaders.current.length ||
    nextHeaders.some((header, index) => header !== previousHeaders.current[index])
  ) {
    previousHeaders.current = nextHeaders;
  }
  const headers = previousHeaders.current;
  const requestSyncRef = useRef<(() => void) | null>(null);

  const findAnchor = useMemoizedFn((header: OutlineHeader, index: number): HTMLElement | null => {
    if (resolveAnchor) return resolveAnchor(header, index);
    return document.getElementById(header.id);
  });

  useEffect(() => {
    if (!scrollEl) return;

    let raf = 0;
    let previous = 0;
    const sync = () => {
      raf = 0;
      const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;
      // 触底时选中末节，1px 容差兼容缩放取整。
      if (maxScrollTop > 1 && scrollEl.scrollTop >= maxScrollTop - 1) {
        setActiveId(headers[headers.length - 1]?.id ?? null);
        return;
      }
      const containerTop = scrollEl.getBoundingClientRect().top + scrollEl.clientTop;
      const containerBottom = containerTop + scrollEl.clientHeight;
      const anchors = headers.flatMap((header, index) => {
        const anchor = findAnchor(header, index);
        for (let node = anchor; node && node !== scrollEl; node = node.parentElement) {
          if (node.hidden || node.style?.display === "none") return [];
        }
        return anchor ? [{ header, anchor }] : [];
      });
      const result = locateOutlineHeader(
        anchors.length,
        index => anchors[index].anchor.getBoundingClientRect(),
        containerTop,
        containerBottom,
        previous
      );
      previous = result.next;
      setActiveId(anchors[result.active]?.header.id ?? null);
    };
    const requestSync = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    requestSyncRef.current = requestSync;

    sync();
    scrollEl.addEventListener("scroll", requestSync, { passive: true });
    const observer = new ResizeObserver(requestSync);
    observer.observe(scrollEl);
    return () => {
      scrollEl.removeEventListener("scroll", requestSync);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      requestSyncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEl, headers, resolveAnchor, findAnchor]);

  useEffect(() => requestSyncRef.current?.(), [incomingHeaders]);

  const scrollToHeader = useMemoizedFn((header: OutlineHeader, index: number) => {
    const anchor = findAnchor(header, index);
    if (!anchor || !scrollEl) return;
    const top =
      anchor.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop;
    scrollEl.scrollTo({ top, behavior: "smooth" });
  });

  if (headers.length === 0) return null;

  return (
    <nav aria-label="大纲" className={cn("w-[208px]", className)}>
      {showTitle && (
        <div className="px-0.5 pb-2">
          <b className="text-tau-sm font-semibold">大纲</b>
        </div>
      )}
      {headers.map((header, index) => (
        <OutlineItem
          key={header.id}
          header={header}
          index={index}
          active={activeId === header.id}
          onSelect={scrollToHeader}
        />
      ))}
    </nav>
  );
}

/** 单条大纲：超长标题单行省略，仅在确实截断时悬停出全文 Tooltip */
const OutlineItem = memo(function OutlineItem({
  header,
  index,
  active,
  onSelect,
}: {
  header: OutlineHeader;
  index: number;
  active: boolean;
  onSelect(header: OutlineHeader, index: number): void;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [header.title]);

  return (
    <Tooltip content={header.title} placement="left" disabled={!truncated}>
      <button
        type="button"
        onClick={() => onSelect(header, index)}
        className={cn(
          "rounded-tau-sm text-ink-3 ease-tau-out mt-1 block border-l-2 border-transparent py-[5px] pl-2.5 pr-2 text-left leading-snug transition-colors duration-150",
          // 缩进用 margin 而非 padding：背景贴住缩进后的条目，左端不留空白块；
          // 宽度显式扣除缩进量，避免 w-full + margin 向右溢出
          header.level >= 3 ? "text-tau-micro ml-4 w-[calc(100%-1rem)]" : "w-full",
          // 选中项不再叠 hover 样式，避免高亮被 hover 底色盖掉
          active
            ? "border-accent bg-selected text-accent-text font-medium"
            : "hover:bg-hover hover:text-ink-1"
        )}
      >
        <span ref={textRef} className="block truncate">
          {header.title}
        </span>
      </button>
    </Tooltip>
  );
});
