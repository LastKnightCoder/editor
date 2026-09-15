import { useEffect, useLayoutEffect, useState } from "react";

export type ScrollState = {
  /** 已滚离顶部（scrollTop > 1，1px 容差吸收 DPI 缩放下的取整残留）：顶部渐隐的显示条件 */
  scrolled: boolean;
  /** 还能向下滚动（未滚到底）：底部渐隐的显示条件；内容不足一屏时恒为 false */
  canScrollDown: boolean;
};

export type EdgeFadeOptions = {
  /** 启用顶部渐隐（默认 true） */
  top?: boolean;
  /** 启用底部渐隐（默认 true）。末尾内容需要完整可见的页面（无底部留白）可传 false 关掉 */
  bottom?: boolean;
};

/** 滚动边缘状态：scroll 事件 + ResizeObserver（容器尺寸随窗口缩放/侧栏拖宽变化）+
    MutationObserver（列表数据异步到达撑高内容）三路监听，布尔翻转才 setState。
    useLayoutEffect 内完成首次测量，避免能滚页面首帧渐隐缺失的闪烁。
    参数是元素而非 RefObject：视图常有 loading 早退分支（容器晚于首帧挂载），
    配合 callback ref 的 setState 才能在挂载时重新接线 */
export function useScrollState(el: HTMLElement | null): ScrollState {
  const [state, setState] = useState<ScrollState>({ scrolled: false, canScrollDown: false });

  useLayoutEffect(() => {
    if (!el) return;

    let rafId = 0;
    const measure = () => {
      const scrolled = el.scrollTop > 1;
      const canScrollDown = el.scrollHeight - el.scrollTop - el.clientHeight > 1;
      setState(prev =>
        prev.scrolled === scrolled && prev.canScrollDown === canScrollDown
          ? prev
          : { scrolled, canScrollDown }
      );
    };
    const measureSync = () => {
      cancelAnimationFrame(rafId);
      measure();
    };
    const measureOnRaf = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener("scroll", measureSync, { passive: true });
    // 环境守卫：jsdom 缺 Observer 时不致崩，仅失去尺寸/结构变化的自动重测
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureOnRaf);
    resizeObserver?.observe(el);
    const mutationObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(measureOnRaf);
    mutationObserver?.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", measureSync);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [el]);

  return state;
}

/** 滚动边缘渐隐驱动：把 useScrollState 的结果写为容器 CSS 变量
    （--edge-top-on / --edge-bottom-on，0 或 1），配合 .home-scroll 的 mask 渐变收放渐隐带。
    纯 DOM 写变量，不触发额外渲染 */
export function useEdgeFade(el: HTMLElement | null, options: EdgeFadeOptions = {}) {
  const { top = true, bottom = true } = options;
  const { scrolled, canScrollDown } = useScrollState(el);
  // 静态化配置：滚动回调不因每次渲染的对象字面量而重复执行
  const [topOn, bottomOn] = [top, bottom];

  useEffect(() => {
    if (!el) return;
    el.style.setProperty("--edge-top-on", topOn && scrolled ? "1" : "0");
    el.style.setProperty("--edge-bottom-on", bottomOn && canScrollDown ? "1" : "0");
  }, [el, topOn, bottomOn, scrolled, canScrollDown]);
}
