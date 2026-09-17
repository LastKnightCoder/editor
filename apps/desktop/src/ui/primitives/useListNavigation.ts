/**
 * 列表导航 hook（Select / Menu 共用，D-007 预告的两例交集抽取）。
 *
 * 只管「高亮在序列上怎么走」：环游移动（跳过 disabled）、边缘直达（目标
 * disabled 不落高亮）、type-ahead 400ms 打字窗口。序列经 items() 在每次
 * 导航时实时取——过滤、动态增删天然跟随，hook 不持有列表副本。
 *
 * T 是项的标识：Select 用索引 number，Menu 用 DOM id string。
 */

import { useEffect, useRef, useState } from "react";

export interface UseListNavigationOptions<T> {
  /** 当前可导航序列（keydown 时实时取） */
  items: () => readonly T[];
  isDisabled: (item: T) => boolean;
  /** 打开 / 序列变化后的高亮归位 */
  initial: () => T | null;
}

const TYPE_AHEAD_MS = 400;

export function useListNavigation<T>(opts: UseListNavigationOptions<T>) {
  const [current, setCurrent] = useState<T | null>(null);
  const typeBuf = useRef("");
  const typeTimer = useRef<number>(0);

  const reset = () => setCurrent(opts.initial());

  /** 环游一步：先移动再落位（跳过 disabled）；无高亮时按方向落首/末项；全 disabled 不动 */
  const move = (dir: 1 | -1) => {
    const items = opts.items();
    const n = items.length;
    if (!n) return;
    const start = items.findIndex(t => Object.is(t, current));
    // 无高亮时取虚拟起点，使第一步恰好落在 0（向下）/ n-1（向上）
    let i = start < 0 ? (dir === 1 ? -1 : n) : start;
    for (let guard = 0; guard < n; guard++) {
      i = (i + dir + n) % n;
      if (!opts.isDisabled(items[i])) {
        setCurrent(items[i]);
        return;
      }
    }
  };

  /** Home / End：目标位是 disabled 则保持不动 */
  const edge = (which: "home" | "end") => {
    const items = opts.items();
    if (!items.length) return;
    const target = which === "home" ? items[0] : items[items.length - 1];
    if (!opts.isDisabled(target)) setCurrent(target);
  };

  /** 打字缓冲：窗口内累积前缀；find 返回命中项则落高亮并返回它 */
  const typeAhead = (ch: string, find: (buf: string) => T | undefined): T | undefined => {
    typeBuf.current += ch.toLowerCase();
    window.clearTimeout(typeTimer.current);
    typeTimer.current = window.setTimeout(() => (typeBuf.current = ""), TYPE_AHEAD_MS);
    const hit = find(typeBuf.current);
    if (hit !== undefined) setCurrent(hit);
    return hit;
  };

  // 卸载清挂起的 type-ahead
  useEffect(() => () => window.clearTimeout(typeTimer.current), []);

  return { current, set: setCurrent, reset, move, edge, typeAhead };
}
