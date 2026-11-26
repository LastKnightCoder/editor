/**
 * 一天：左侧粘性日期列（相对日 / 大号日 / 月·周 / N 条·M 字）+
 * 右侧当天条目。同一张纸内分组只靠留白与日期列，不画分隔线、不拆日卡（PREFERENCES）。
 */

import { monthLabel, weekdayOf, relativeDay } from "../format";
import { useDiaryI18n } from "../i18n";
import { memo } from "react";
import { keyDate, type DayGroup } from "../model";
import { MomentItem, type MomentItemProps } from "./MomentItem";

type ItemProps = Omit<MomentItemProps, "moment" | "fresh">;

export const DaySection = memo(function DaySection({
  group,
  freshIds,
  ...item
}: ItemProps & { group: DayGroup; freshIds: ReadonlySet<number> }) {
  const { t, locale } = useDiaryI18n();
  const d = keyDate(group.day);
  const rel = relativeDay(group.day, item.today, locale);
  const otherYear = d.getFullYear() !== keyDate(item.today).getFullYear();
  return (
    <section
      data-day={group.day}
      className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-[22px] pt-[26px] pb-1"
    >
      <div className="sticky top-[18px] self-start pt-2">
        {otherYear && (
          <div className="text-tau-tiny text-ink-3 font-tau-mono mb-1.5 leading-none">
            {d.getFullYear().toLocaleString(locale, { useGrouping: false })}
          </div>
        )}
        {rel && <div className="text-tau-meta text-accent-text mb-1.5 font-medium">{rel}</div>}
        <div className="text-[32px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {d.getDate().toLocaleString(locale)}
        </div>
        <div className="text-tau-meta text-ink-2 mt-1.5">
          {monthLabel(group.day.slice(0, 7), locale)} · {weekdayOf(group.day, locale)}
        </div>
        <div className="text-tau-tiny text-ink-3 mt-[3px] whitespace-nowrap tabular-nums">
          {t("summary.day", {
            entries: group.moments.length.toLocaleString(locale),
            words: group.words.toLocaleString(locale),
          })}
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
