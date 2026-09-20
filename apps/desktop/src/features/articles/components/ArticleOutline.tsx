/**
 * 文章目录（mockups/article-detail/plan-a4-quiet.html 定稿形态，重写而非复用
 * legacy EditorOutline + Outline 两级组件）。
 * 能力：点击条目在滚动容器内平滑定位到标题锚点；滚动时同步高亮当前节
 * （legacy 仅有点击滚动，滚动→高亮的同步是本轮新增）。
 * 锚点解析协议：默认按 header.id 查 DOM；编辑器场景由调用方传 resolveAnchor
 * （按序索引编辑器实时 children，见 props 注释）。
 */

import { useEffect, useState } from "react";
import type { Descendant } from "slate";
import type { HeaderElement } from "@tau/editor/src";
import { getInlineElementText } from "@/utils";
import { cn } from "@tau/ui";

export interface OutlineHeader {
  /** 标题锚点的 DOM id（默认解析方案用；编辑器方案仅作 React key） */
  id: string;
  level: number;
  title: string;
}

interface ArticleOutlineProps {
  headers: OutlineHeader[];
  /** 滚动容器：高亮同步的观察根，也是点击定位的滚动目标 */
  scrollEl?: HTMLElement | null;
  /**
   * 锚点解析：默认按 id 查 DOM；编辑器场景须传 index 方案——编辑器 onChange
   * 输出经 normalize 重建（props 里的节点引用与 editor.children 脱钩，直接
   * toDOMNode 会抛错），按序索引实时 editor.children 才能拿到可解析的节点
   */
  resolveAnchor?: (header: OutlineHeader, index: number) => HTMLElement | null;
  className?: string;
}

/** 当前节 = 顶边位于容器顶部 25% 视线以下的最后一个标题 */
const ACTIVE_LINE_RATIO = 0.25;

/** 从 Slate 正文提取标题结构（提取口径复刻 legacy EditorOutline） */
export function extractArticleHeaders(content: Descendant[] | null | undefined): OutlineHeader[] {
  if (!content) return [];
  const headers = content.filter(
    node => (node as { type?: string }).type === "header"
  ) as HeaderElement[];
  return headers.map((header, index) => ({
    id: `article-h-${index}`,
    level: header.level,
    title: header.children.map(getInlineElementText).join(""),
  }));
}

export function ArticleOutline({
  headers,
  scrollEl,
  resolveAnchor,
  className,
}: ArticleOutlineProps) {
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
      const containerTop = scrollEl.getBoundingClientRect().top;
      const line = containerTop + scrollEl.clientHeight * ACTIVE_LINE_RATIO;
      let current: string | null = null;
      // headers 与正文顺序一致：找到最后一个越过视线的标题即停
      for (let index = 0; index < headers.length; index += 1) {
        const anchor = findAnchor(headers[index], index);
        if (!anchor) continue;
        if (anchor.getBoundingClientRect().top <= line) current = headers[index].id;
        else break;
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
    <nav aria-label="目录" className={cn("w-[208px]", className)}>
      <div className="flex items-baseline gap-1.5 px-0.5 pb-2">
        <b className="text-tau-sm font-semibold">目录</b>
        <span className="font-tau-mono text-ink-3 text-[10px] tracking-wider">OUTLINE</span>
      </div>
      {headers.map((header, index) => (
        <button
          key={header.id}
          type="button"
          onClick={() => scrollToHeader(header, index)}
          className={cn(
            "rounded-tau-sm text-ink-3 ease-tau-out hover:bg-hover hover:text-ink-1 block w-full border-l-2 border-transparent py-[5px] pl-2.5 pr-2 text-left leading-snug transition-colors duration-150",
            header.level >= 3 && "text-tau-micro pl-6",
            activeId === header.id && "border-accent bg-selected text-accent-text font-medium"
          )}
        >
          {header.title}
        </button>
      ))}
    </nav>
  );
}
