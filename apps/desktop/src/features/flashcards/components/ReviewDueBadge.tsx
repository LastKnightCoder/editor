/**
 * 侧栏「闪卡复习」入口的待复习数徽标：有待复习卡时显示计数（收起为图标列时退化为角点）。
 * 数据走 useNavDueCount（复习页打开时以页面队列为准，否则口径同首页「待复习」）；主进程写命令广播 flashcards:changed 时
 * 随 ["flashcards"] 前缀即时失效，窗口聚焦刷新兜底同步等绕过表层的写入。
 */

import { flashcardsCount, useFlashcardsI18n } from "../i18n";
import { useNavDueCount } from "../queries";

export function ReviewDueBadge({ collapsed }: { collapsed: boolean }) {
  useFlashcardsI18n();
  const count = useNavDueCount();
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-accent absolute top-2 right-2.5 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={flashcardsCount("count.due", count)}
      className="bg-accent text-ink-inverse ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] leading-[18px] font-[600] tabular-nums"
    >
      {count}
    </span>
  );
}
