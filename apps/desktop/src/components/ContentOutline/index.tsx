/**
 * 正文公共目录：文章与项目文档共用。
 * 能力：点击条目在滚动容器内平滑定位到标题锚点；滚动时同步高亮当前节
 * （legacy 仅有点击滚动，滚动→高亮的同步是本轮新增）。
 * 锚点解析协议：默认按 header.id 查 DOM；编辑器场景由调用方传 resolveAnchor
 * （按序索引编辑器实时 children，见 props 注释）。
 */

import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { HeaderElement } from "@tau/editor/extensions/header";
export { resolveHeaderAnchor as resolveEditorHeaderAnchor } from "@tau/editor/extensions/header";
import { getInlineElementText } from "@/utils";
import { Tooltip, cn } from "@tau/ui";

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
   * 锚点解析：默认按 id 查 DOM；编辑器场景须传 index 方案——编辑器 onChange
   * 输出经 normalize 重建（props 里的节点引用与 editor.children 脱钩，直接
   * toDOMNode 会抛错），按序索引实时 editor.children 才能拿到可解析的节点
   */
  resolveAnchor?: (header: OutlineHeader, index: number) => HTMLElement | null;
  /** 顶部「大纲」小标题（外层已有标题时关掉，如侧栏页签） */
  showTitle?: boolean;
  className?: string;
}

/** 从 Slate 正文提取标题结构（提取口径复刻 legacy EditorOutline） */
export function extractContentHeaders(content: Descendant[] | null | undefined): OutlineHeader[] {
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
  headers,
  scrollEl,
  resolveAnchor,
  showTitle = true,
  className,
}: ContentOutlineProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const findAnchor = (header: OutlineHeader, index: number): HTMLElement | null => {
    if (resolveAnchor) return resolveAnchor(header, index);
    return document.getElementById(header.id);
  };

  useEffect(() => {
    if (!scrollEl) return;

    let raf = 0;
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
      let current: string | null = null;
      // 优先最上方可见标题；没有可见标题时回落到视口上方最近的章节。
      for (let index = 0; index < headers.length; index += 1) {
        const anchor = findAnchor(headers[index], index);
        if (!anchor) continue;
        const rect = anchor.getBoundingClientRect();
        if (rect.bottom <= containerTop) {
          current = headers[index].id;
          continue;
        }
        if (rect.top < containerBottom) current = headers[index].id;
        break;
      }
      setActiveId(current);
    };
    const requestSync = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };

    sync();
    scrollEl.addEventListener("scroll", requestSync, { passive: true });
    const observer = new ResizeObserver(requestSync);
    observer.observe(scrollEl);
    return () => {
      scrollEl.removeEventListener("scroll", requestSync);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEl, headers, resolveAnchor]);

  const scrollToHeader = (header: OutlineHeader, index: number) => {
    const anchor = findAnchor(header, index);
    if (!anchor || !scrollEl) return;
    const top =
      anchor.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop;
    scrollEl.scrollTo({ top, behavior: "smooth" });
  };

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
          active={activeId === header.id}
          onSelect={() => scrollToHeader(header, index)}
        />
      ))}
    </nav>
  );
}

/** 单条大纲：超长标题单行省略，仅在确实截断时悬停出全文 Tooltip */
function OutlineItem({
  header,
  active,
  onSelect,
}: {
  header: OutlineHeader;
  active: boolean;
  onSelect(): void;
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
        onClick={onSelect}
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
}
