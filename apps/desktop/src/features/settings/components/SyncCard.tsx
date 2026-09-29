/**
 * 同步状态卡的统计行与动作行（数据库卡 / 资源文件卡共用）：
 * 统计项等分整行宽度，动作按钮等宽铺满，卡片左右不留空半边。
 */

import type { ReactNode } from "react";
import clsx from "clsx";

export interface SyncStatItem {
  label: string;
  value: ReactNode;
  /** 数值着色（远程领先 / 失败数等） */
  valueClassName?: string | false;
}

export function SyncStats({ items }: { items: SyncStatItem[] }) {
  return (
    <dl className="mt-3.5 grid auto-cols-fr grid-flow-col gap-3">
      {items.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="text-tau-sm text-ink-2">{item.label}</dt>
          <dd
            className={clsx(
              "text-tau-title font-semibold tabular-nums leading-tight",
              item.valueClassName
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SyncActions({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex gap-2 pt-4 *:flex-1">{children}</div>;
}
