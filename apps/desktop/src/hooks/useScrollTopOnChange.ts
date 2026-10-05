import { useLayoutEffect, useRef } from "react";

const UNSET = Symbol("unset");

/**
 * key 变化时把滚动容器滚回顶部（筛选 / 排序切换）。
 * 保活页从隐藏恢复显示时 Activity 会重跑 effect，这不算 key 变化——否则每次
 * 从详情返回都会丢掉滚动位置，形变转场的新画面里列表还会随之重排。
 */
export function useScrollTopOnChange(
  scrollEl: HTMLElement | null,
  key: unknown,
  onReset?: () => void
) {
  const lastKey = useRef<unknown>(UNSET);
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  useLayoutEffect(() => {
    if (!scrollEl || Object.is(lastKey.current, key)) return;
    const first = lastKey.current === UNSET;
    lastKey.current = key;
    if (first) return;
    scrollEl.scrollTop = 0;
    onResetRef.current?.();
  }, [scrollEl, key]);
}
