import { RefObject, useEffect, useRef, useCallback } from "react";
import { ReactEditor } from "slate-react";
import type { EditorRef } from "@tau/editor/src/types/editor";

interface UseTypewriterScrollOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLDivElement>;
  editorRef: RefObject<EditorRef>;
}

/**
 * 打字机滚动 Hook
 * 保持光标始终在屏幕中央位置，类似 Typora 的打字机模式
 */
export function useTypewriterScroll({
  enabled,
  containerRef,
  editorRef,
}: UseTypewriterScrollOptions) {
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const lastScrollTopRef = useRef(0);
  const rafIdRef = useRef<number>();

  const scrollToCursor = useCallback(() => {
    if (!enabled || !containerRef.current || !editorRef.current) {
      return;
    }

    // 如果用户正在手动滚动，不执行自动滚动
    if (isUserScrollingRef.current) {
      return;
    }

    const container = containerRef.current;
    const editor = editorRef.current.getEditor();

    if (!editor) {
      return;
    }

    try {
      const { selection } = editor;
      if (!selection) {
        return;
      }

      // 获取光标的 DOM 位置
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        return;
      }

      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // 如果 rect 无效，尝试使用 ReactEditor.toDOMPoint
      if (rect.height === 0) {
        try {
          const domPoint = ReactEditor.toDOMPoint(editor, selection.focus);
          const domNode = domPoint[0] as HTMLElement;

          if (!domNode || !domNode.getBoundingClientRect) {
            return;
          }

          const nodeRect = domNode.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // 当前光标在视口中的位置
          const cursorY = nodeRect.top;
          const containerTop = containerRect.top;
          const containerHeight = containerRect.height;

          // 目标位置：容器高度的中央
          const targetY = containerHeight / 2;

          // 计算需要滚动的距离
          const cursorOffsetFromTop = cursorY - containerTop;
          const scrollOffset = cursorOffsetFromTop - targetY;

          // 计算新的滚动位置
          const currentScrollTop = container.scrollTop;
          const newScrollTop = currentScrollTop + scrollOffset;

          // 边界检测
          const maxScroll = container.scrollHeight - container.clientHeight;

          // 文档过短时不执行居中滚动
          if (maxScroll <= 0) {
            return;
          }

          // 限制滚动范围
          const boundedScroll = Math.max(0, Math.min(maxScroll, newScrollTop));

          // 只有滚动距离超过阈值才执行（避免微小抖动）
          const scrollThreshold = 5;
          if (Math.abs(scrollOffset) < scrollThreshold) {
            return;
          }

          // 平滑滚动
          container.scrollTo({
            top: boundedScroll,
            behavior: "smooth",
          });
        } catch (error) {
          // 忽略 DOM 访问错误
          console.debug("Typewriter scroll error:", error);
        }
        return;
      }

      const containerRect = container.getBoundingClientRect();

      // 当前光标在视口中的位置
      const cursorY = rect.top + rect.height / 2;
      const containerTop = containerRect.top;
      const containerHeight = containerRect.height;

      // 目标位置：容器高度的中央
      const targetY = containerHeight / 2;

      // 计算需要滚动的距离
      const cursorOffsetFromTop = cursorY - containerTop;
      const scrollOffset = cursorOffsetFromTop - targetY;

      // 计算新的滚动位置
      const currentScrollTop = container.scrollTop;
      const newScrollTop = currentScrollTop + scrollOffset;

      // 边界检测
      const maxScroll = container.scrollHeight - container.clientHeight;

      // 文档过短时不执行居中滚动
      if (maxScroll <= 0) {
        return;
      }

      // 限制滚动范围
      const boundedScroll = Math.max(0, Math.min(maxScroll, newScrollTop));

      // 只有滚动距离超过阈值才执行（避免微小抖动）
      const scrollThreshold = 5;
      if (Math.abs(scrollOffset) < scrollThreshold) {
        return;
      }

      // 使用 smooth 滚动
      container.scrollTo({
        top: boundedScroll,
        behavior: "smooth",
      });
    } catch (error) {
      // 忽略 DOM 访问错误
      console.debug("Typewriter scroll error:", error);
    }
  }, [enabled, containerRef, editorRef]);

  useEffect(() => {
    if (!enabled || !containerRef.current || !editorRef.current) {
      return;
    }

    const container = containerRef.current;

    /**
     * 监听用户手动滚动
     */
    const handleUserScroll = () => {
      const currentScrollTop = container.scrollTop;

      // 检测是否是用户主动滚动（而非程序触发）
      // 降低阈值，更灵敏地检测用户滚动
      if (Math.abs(currentScrollTop - lastScrollTopRef.current) > 3) {
        isUserScrollingRef.current = true;

        // 清除之前的定时器
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // 2秒后恢复自动滚动（给用户足够的浏览时间）
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 2000);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    /**
     * 监听窗口大小变化
     */
    const handleResize = () => {
      if (!isUserScrollingRef.current) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(scrollToCursor);
      }
    };

    // 监听容器滚动事件
    container.addEventListener("scroll", handleUserScroll, { passive: true });

    // 监听窗口大小变化
    window.addEventListener("resize", handleResize);

    // 初始滚动到光标位置
    setTimeout(() => {
      scrollToCursor();
    }, 200);

    // 清理函数
    return () => {
      container.removeEventListener("scroll", handleUserScroll);
      window.removeEventListener("resize", handleResize);

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [enabled, containerRef, editorRef, scrollToCursor]);

  // 返回 scrollToCursor 函数，供外部调用
  return scrollToCursor;
}
