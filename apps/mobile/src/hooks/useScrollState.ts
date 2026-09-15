import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export type ScrollState = {
  /** 已滚离顶部（scrollTop > 0）：顶部渐隐的显示条件 */
  scrolled: boolean;
  /** 还能向下滚动（未滚到底）：底部渐隐的显示条件；内容不足一屏时恒为 false */
  canScrollDown: boolean;
  /** 已滚离左端（scrollLeft > 0）：横向左端渐隐的显示条件 */
  scrolledX: boolean;
  /** 还能向右滚动：横向右端渐隐的显示条件；内容不溢出时恒为 false */
  canScrollRight: boolean;
};

export type EdgeFadeOptions = {
  /** 启用顶部渐隐（默认 true） */
  top?: boolean;
  /** 启用底部渐隐（默认 true）。滚动区止于安全区上方的页面应保持默认；
   *  仅当内容会贴到滚动容器底缘（无外挂留白）时才传 false 关掉，避免末尾内容被渐隐吞掉 */
  bottom?: boolean;
};

const INITIAL_SCROLL_STATE: ScrollState = {
  scrolled: false,
  canScrollDown: false,
  scrolledX: false,
  canScrollRight: false,
};

/** 持有滚动容器元素：元素可能晚于首次渲染出现（加载态是早退分支，数据到达才渲染容器），
    也可能卸载后重建，两种情况都要重新接管。
    必须在每次提交后重新读 ref —— 渲染期读到的只是上一次提交的值，挂载那一次永远拿不到。
    元素卸载时归 null，让调用方的 effect 走 cleanup 解绑监听 */
function useScrollElement(ref: RefObject<HTMLElement | null>): HTMLElement | null {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    setElement(previous => (el === previous ? previous : el));
  });
  return element;
}

/** 滚动边缘状态：scroll 事件 + ResizeObserver（容器尺寸随键盘/转场变化）+
    MutationObserver（列表数据异步到达撑高内容）三路监听，布尔翻转才 setState。
    测量在 useLayoutEffect 内完成，容器到位（首次渲染或数据到达后）当帧即有正确渐隐状态 */
export function useScrollState(ref: RefObject<HTMLElement | null>): ScrollState {
  const [state, setState] = useState<ScrollState>(INITIAL_SCROLL_STATE);
  const element = useScrollElement(ref);

  useLayoutEffect(() => {
    const el = element;
    if (!el) return;

    let rafId = 0;
    const measure = () => {
      const scrolled = el.scrollTop > 0;
      const canScrollDown = el.scrollHeight - el.scrollTop - el.clientHeight > 1;
      const scrolledX = el.scrollLeft > 0;
      const canScrollRight = el.scrollWidth - el.scrollLeft - el.clientWidth > 1;
      setState(prev =>
        prev.scrolled === scrolled &&
        prev.canScrollDown === canScrollDown &&
        prev.scrolledX === scrolledX &&
        prev.canScrollRight === canScrollRight
          ? prev
          : { scrolled, canScrollDown, scrolledX, canScrollRight }
      );
    };
    const measureSync = () => {
      cancelAnimationFrame(rafId);
      measure();
    };
    // DOM 结构变化可能高频（虚拟列表回收节点），合并到下一帧统一测量
    const measureOnRaf = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener("scroll", measureSync, { passive: true });
    // 环境守卫：jsdom 与极老 WebView 缺 Observer 时不致崩，仅失去尺寸/结构变化的自动重测
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
  }, [element]);

  return state;
}

/** 滚动边缘渐隐驱动：把 useScrollState 的结果写为容器 CSS 变量
    （--edge-top-on / --edge-bottom-on，0 或 1），配合 .edge-fade-scroll 类收放渐隐带。
    纯 DOM 写变量，不触发额外渲染 */
export function useEdgeFade(ref: RefObject<HTMLElement | null>, options: EdgeFadeOptions = {}) {
  const { top = true, bottom = true } = options;
  const element = useScrollElement(ref);
  const { scrolled, canScrollDown } = useScrollState(ref);
  // 静态化配置：滚动回调不因每次渲染的对象字面量而重复执行
  const optionsRef = useRef({ top, bottom });
  optionsRef.current = { top, bottom };

  // 依赖元素而非 ref 对象：元素晚到或换新节点时也要补写一次变量，
  // 否则变量停在"未写入"，只能由 CSS 缺省值兜底
  useEffect(() => {
    if (!element) return;
    const { top: topOn, bottom: bottomOn } = optionsRef.current;
    element.style.setProperty("--edge-top-on", topOn && scrolled ? "1" : "0");
    element.style.setProperty("--edge-bottom-on", bottomOn && canScrollDown ? "1" : "0");
  }, [element, scrolled, canScrollDown]);
}

/** 横向滚动边缘渐隐驱动：写 --edge-x-start-on / --edge-x-end-on，配合 .edge-fade-x-scroll。
    横向容器多为筛选条这类"内容常不溢出"的窄条，不溢出时两端必须无带（故类里缺省 0） */
export function useEdgeFadeX(ref: RefObject<HTMLElement | null>) {
  const element = useScrollElement(ref);
  const { scrolledX, canScrollRight } = useScrollState(ref);

  useEffect(() => {
    if (!element) return;
    element.style.setProperty("--edge-x-start-on", scrolledX ? "1" : "0");
    element.style.setProperty("--edge-x-end-on", canScrollRight ? "1" : "0");
  }, [element, scrolledX, canScrollRight]);
}
