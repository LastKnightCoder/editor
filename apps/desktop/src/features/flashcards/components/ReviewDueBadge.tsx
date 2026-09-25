/**
 * 侧栏「闪卡复习」入口的待复习数徽标：有待复习卡时显示计数（收起为图标列时退化为角点）。
 * 数据走 useNavDueCount（口径同首页「待复习」）；主进程写命令广播 flashcards:changed 时
 * 随 ["flashcards"] 前缀即时失效，窗口聚焦刷新兜底同步等绕过表层的写入。
 */

import { useNavDueCount } from "../queries";

export function ReviewDueBadge({ collapsed }: { collapsed: boolean }) {
  const count = useNavDueCount();
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-accent absolute right-2.5 top-2 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={`${count} 张闪卡待复习`}
      className="bg-accent text-ink-inverse ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] font-[600] tabular-nums leading-[18px]"
    >
      {count}
    </span>
  );
}
