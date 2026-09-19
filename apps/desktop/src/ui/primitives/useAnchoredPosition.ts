/**
 * 锚定跟随 hook —— open 期间的浮层定位生命周期（useAnchoredPosition）。
 * Tooltip / Menu / Select / Popover 四家原先各写一遍的同构 useLayoutEffect 收口于此
 * （D-014 抽取）：进场双遍定位（先量内容实际尺寸再精调）→ scroll(capture)/resize
 * rAF 合并重算 → 内容尺寸变化经 ResizeObserver 自适应（jsdom 无 RO，静默跳过）→
 * 可选 rAF 轮询锚 rect（Tooltip 特有的动态锚：趋势图 hover 热区随鼠标移动，无 DOM
 * 事件可挂）。
 *
 * 位置写入分两段：left/top 与消费者无关，hook 直写；side/箭头投影等衍生写入由
 * onPlace 回调承担（Tooltip/Popover 写箭头、Menu/Select 写 data-dir）。
 */

import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  computeAnchoredPosition,
  type AnchoredPlacement,
  type AnchoredPosition,
} from "./anchoredPosition";

export interface UseAnchoredPositionOptions {
  open: boolean;
  /** 锚点矩形来源（触发器 rect / 右键命中点虚拟 rect / 父项 rect……） */
  getAnchor: () => {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  popRef: RefObject<HTMLElement | null>;
  placement: AnchoredPlacement;
  gap?: number;
  /** rAF 轮询锚 rect 变化并重定位（动态锚场景，默认关） */
  pollAnchor?: boolean;
  /** 衍生写入：side / arrowX / arrowY / data-* 等，随每次定位调用 */
  onPlace?: (pos: AnchoredPosition, pop: HTMLElement) => void;
}

export function useAnchoredPosition({
  open,
  getAnchor,
  popRef,
  placement,
  gap,
  pollAnchor = false,
  onPlace,
}: UseAnchoredPositionOptions) {
  const getAnchorRef = useRef(getAnchor);
  const onPlaceRef = useRef(onPlace);
  getAnchorRef.current = getAnchor;
  onPlaceRef.current = onPlace;

  useLayoutEffect(() => {
    if (!open) return;
    const pop = popRef.current;
    if (!pop) return;
    const place = () => {
      const anchor = getAnchorRef.current();
      if (!anchor) return;
      const pos = computeAnchoredPosition(
        anchor,
        pop,
        placement,
        gap !== undefined ? { gap } : undefined
      );
      pop.style.left = `${pos.x}px`;
      pop.style.top = `${pos.y}px`;
      onPlaceRef.current?.(pos, pop);
    };
    place();
    place(); // 两遍：第一遍后浮层已有实际尺寸（style 写入触发同步布局），第二遍精调

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        place();
      });
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    // 内容变化 → 浮层尺寸变化 → 重定位；不用内容 props 做代理（父级无关 re-render
    // 也会换 identity，重挂整个生命周期）。RO 回调在 paint 前执行，直写无闪烁；
    // Select 的 onPlace 写 minWidth 会改尺寸，第二轮值不变即收敛
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
    ro?.observe(pop);

    let raf = 0;
    let lastRect = "";
    const poll = () => {
      const anchor = getAnchorRef.current();
      if (anchor) {
        const key = `${anchor.left},${anchor.top},${anchor.width},${anchor.height}`;
        if (key !== lastRect) {
          lastRect = key;
          place();
        }
      }
      raf = requestAnimationFrame(poll);
    };
    if (pollAnchor) raf = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
    // placement / gap / pollAnchor 属定位参数；getAnchor / onPlace 经 ref 稳定化不参与重挂
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement, gap, pollAnchor]);
}
