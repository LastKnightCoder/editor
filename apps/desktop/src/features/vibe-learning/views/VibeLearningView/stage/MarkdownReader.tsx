/**
 * 文档类资料的文本阅读：分段读取转换后的 Markdown（每段在空行处切开，不截断段落），
 * 触底自动续读；渲染沿用对话的 Markdown 排版。
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { FadeScroll } from "@tau/ui";
import useTheme from "@/hooks/useTheme";
import { readVLResourceRange } from "@/commands/vibe-learning";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import MarkdownRenderer from "@/components/ChatSidebar/MarkdownRenderer";
import type { VLResource } from "@/types/vibe-learning";

const CHUNK = 60_000;

/** 在块尾附近找切口：优先空行，其次换行；找不到就整块 */
function cutPoint(text: string): number {
  const min = Math.floor(text.length / 2);
  const para = text.lastIndexOf("\n\n");
  if (para >= min) return para + 2;
  const line = text.lastIndexOf("\n");
  if (line >= min) return line + 1;
  return text.length;
}

interface MarkdownReaderProps {
  resource: VLResource;
  projectId: number;
  mainDbName: string;
}

export function MarkdownReader({ resource, projectId, mainDbName }: MarkdownReaderProps) {
  const { isDark } = useTheme();
  const markdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "vl-reader" });
  const [chunks, setChunks] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const done = total !== null && offset >= total;

  const loadMore = useMemoizedFn(async (from: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const result = await readVLResourceRange({
        projectId,
        mainDbName,
        resourceId: resource.id,
        startOffset: from,
        endOffset: from + CHUNK,
      });
      if (!result.success || result.content === undefined) {
        setError(result.error || "读取失败");
        return;
      }
      const totalChars = result.totalChars ?? from + result.content.length;
      const end = from + result.content.length;
      const cut = end >= totalChars ? result.content.length : cutPoint(result.content);
      const text = result.content.slice(0, cut);
      setTotal(totalChars);
      setOffset(from + cut);
      setChunks(prev => (reset ? [text] : [...prev, text]));
    } catch (e) {
      setError((e as Error).message || "读取失败");
    } finally {
      loadingRef.current = false;
    }
  });

  useEffect(() => {
    setChunks([]);
    setOffset(0);
    setTotal(null);
    setError(null);
    scrollEl?.scrollTo({ top: 0 });
    void loadMore(0, true);
    // 换资料时重读；scrollEl 只用于回到顶部
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id, resource.markdownPath, loadMore]);

  // 触底续读（提前 600px 预取）
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !scrollEl || done || error) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) void loadMore(offset);
      },
      { root: scrollEl, rootMargin: "0px 0px 600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollEl, offset, done, error, loadMore]);

  return (
    <FadeScroll scrollRef={setScrollEl} className="min-h-0 flex-1">
      <div className="text-tau-body-lg text-ink-1 mx-auto max-w-[760px] px-10 pb-16 pt-2 leading-[1.85]">
        <MarkdownProvider isDark={isDark} isVisible>
          {chunks.map((chunk, index) => (
            <MarkdownRenderer
              key={index}
              content={chunk}
              markdownComponents={markdownComponents}
              shouldRender
            />
          ))}
        </MarkdownProvider>
        {error ? (
          <p className="text-tau-meta text-danger py-6 text-center">文本读取失败：{error}</p>
        ) : (
          !done && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              <Loader2 className="text-ink-3 size-5 animate-spin" strokeWidth={1.75} />
            </div>
          )
        )}
      </div>
    </FadeScroll>
  );
}
