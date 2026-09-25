/**
 * 一天（方案 A 的排版，D-044）：左侧粘性日期列（相对日 / 大号日 / 月·周 / N 条·M 字）+
 * 右侧当天条目。同一张纸内分组只靠留白与日期列，不画分隔线、不拆日卡（PREFERENCES）。
 */

import { memo } from "react";
import { keyDate, relativeDay, weekdayOf, type DayGroup } from "../model";
import { MomentItem, type MomentItemProps } from "./MomentItem";

type ItemProps = Omit<MomentItemProps, "moment" | "fresh">;

export const DaySection = memo(function DaySection({
  group,
  freshIds,
  ...item
}: ItemProps & { group: DayGroup; freshIds: ReadonlySet<number> }) {
  const d = keyDate(group.day);
  const rel = relativeDay(group.day, item.today);
  const otherYear = d.getFullYear() !== keyDate(item.today).getFullYear();
  return (
    <section
      data-day={group.day}
      className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-[22px] pb-1 pt-[26px]"
    >
      <div className="sticky top-[18px] self-start pt-2">
        {otherYear && (
          <div className="text-tau-tiny text-ink-3 font-tau-mono mb-1.5 leading-none">
            {d.getFullYear()}
          </div>
        )}
        {rel && <div className="text-tau-meta text-accent-text mb-1.5 font-medium">{rel}</div>}
        <div className="text-[32px] font-semibold tabular-nums leading-none tracking-[-0.02em]">
          {d.getDate()}
        </div>
        <div className="text-tau-meta text-ink-2 mt-1.5">
          {d.getMonth() + 1}月 · {weekdayOf(group.day)}
        </div>
        <div className="text-tau-tiny text-ink-3 mt-[3px] whitespace-nowrap tabular-nums">
          {group.moments.length} 条 · {group.words} 字
        </div>
      </div>
      <div className="min-w-0 space-y-0.5">
        {group.moments.map(m => (
          <MomentItem key={m.id} moment={m} fresh={freshIds.has(m.id)} {...item} />
        ))}
      </div>
    </section>
  );
});
