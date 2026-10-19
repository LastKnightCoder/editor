/**
 * 日记重建：结构摘自 features/diary（DiaryView 工具栏 / DaySection 日块 / MomentItem 一条 / Composer 纸底输入条 / MonthRail 月份刻度）。
 * 按天倒序的流：左列相对日 + 大号日 + 「10月 · 周日」+「N 条 · M 字」，右列是当天的若干条；纸底停着输入条。
 * draft 为输入条里正在打的字；sent 0→1 为发出的那条插进今天顶部（新条目先亮 accent-soft 再褪掉）。
 */
import clsx from "clsx";
import { CalendarDays, Hash, History, Search, SendHorizontal } from "lucide-react";
import { IconButton, Tag } from "@tau/ui";

export type DiaryMoment = { time: string; text: string; tags?: string[] };
export type DiaryDay = { rel: string; day: number; sub: string; moments: DiaryMoment[] };

const chars = (s: string) => s.replace(/\s/g, "").length;

export function DiaryPage({
  summary,
  days,
  months,
  now,
  draft = "",
  sent,
}: {
  summary: { month: number; streak: number };
  days: DiaryDay[];
  months: string[];
  now: string;
  draft?: string;
  sent?: { moment: DiaryMoment; t: number };
}) {
  const fresh = sent && sent.t > 0 ? sent : undefined;
  const list = days.map((day, i) => (i === 0 && fresh ? { ...day, moments: [fresh.moment, ...day.moments] } : day));
  const count = chars(draft);
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mt-5 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg flex shrink-0 items-center gap-2 font-semibold tracking-[-0.01em] whitespace-nowrap">日记</h1>
          <div className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-2">
            <span>
              本月 <b className="text-ink-1 font-semibold tabular-nums">{summary.month + (fresh ? 1 : 0)}</b> 条
            </span>
            <span className="text-ink-3">·</span>
            <span>
              连续记录 <b className="text-ink-1 font-semibold tabular-nums">{summary.streak}</b> 天
            </span>
          </div>
          <span className="flex-1" />
          <IconButton>
            <History className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton>
            <CalendarDays className="size-4" strokeWidth={1.75} />
          </IconButton>
          <span className="bg-surface border-line-1 flex h-[30px] w-[220px] items-center gap-2 rounded-[10px] border pr-2 pl-2.5">
            <Search className="text-ink-3 size-[14px]" strokeWidth={1.75} />
            <span className="text-tau-meta text-ink-3">搜索</span>
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="mx-auto max-w-[860px] px-14 pb-2">
              {list.map(day => (
                <section key={day.day} className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-[22px] pt-[26px] pb-1">
                  <div className="self-start pt-2">
                    <div className="text-tau-meta text-accent-text mb-1.5 font-medium">{day.rel}</div>
                    <div className="text-[32px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{day.day}</div>
                    <div className="text-tau-meta text-ink-2 mt-1.5">{day.sub}</div>
                    <div className="text-tau-tiny text-ink-3 mt-[3px] whitespace-nowrap tabular-nums">
                      {day.moments.length} 条 · {day.moments.reduce((n, m) => n + chars(m.text), 0)} 字
                    </div>
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    {day.moments.map(moment => {
                      const isFresh = fresh && moment === fresh.moment;
                      const open = isFresh ? Math.min(1, fresh.t * 2.5) : 1;
                      const flash = isFresh ? 1 - Math.max(0, (fresh.t - 0.45) / 0.55) : 0;
                      return (
                        <div key={moment.time + moment.text} className="overflow-hidden" style={isFresh ? { maxHeight: 140 * open, opacity: open } : undefined}>
                          <article
                            className="relative -mx-3.5 rounded-[12px] px-3.5 pt-2.5 pb-3"
                            style={flash > 0 ? { background: `color-mix(in srgb, var(--tau-accent-soft) ${Math.round(flash * 100)}%, transparent)` } : undefined}
                          >
                            <div className="mb-2.5 flex h-[22px] items-center gap-2">
                              <span className="text-tau-meta text-ink-3 font-tau-mono font-medium tabular-nums">{moment.time}</span>
                            </div>
                            <p className="text-tau-body-lg leading-[1.8]">{moment.text}</p>
                            {moment.tags && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {moment.tags.map(tag => (
                                  <Tag key={tag} color="orange">
                                    {tag}
                                  </Tag>
                                ))}
                              </div>
                            )}
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <nav className="absolute top-3.5 right-2.5 bottom-3.5 z-[5] flex w-14 flex-col items-end gap-0.5 pb-2">
              <span className="text-tau-tiny text-ink-3 font-tau-mono px-2 pt-2 pb-0.5 opacity-70">2026</span>
              {months.map((m, i) => (
                <span key={m} className={clsx("text-tau-sm h-[22px] shrink-0 rounded-[7px] px-2 tabular-nums", i === 0 ? "text-accent-text font-semibold opacity-100" : "text-ink-3 opacity-55")}>
                  {m}月
                </span>
              ))}
            </nav>
          </div>

          <div className="relative z-[4] flex-none pt-1 pb-3.5 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-7 before:bg-gradient-to-t before:from-[var(--tau-bg-surface)] before:to-transparent">
            <div className="mx-auto max-w-[860px] px-14">
              <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-[22px]">
                <div className="pt-2.5">
                  <b className="text-tau-body block font-semibold">此刻</b>
                  <span className="text-tau-meta text-ink-3 font-tau-mono tabular-nums">{now}</span>
                </div>
                <div className="min-w-0">
                  <div
                    data-hit="diary-input"
                    className={clsx(
                      "bg-surface relative -mx-3.5 rounded-[14px] px-3.5 pt-2.5 pb-2",
                      draft ? "shadow-[0_0_0_1px_var(--tau-accent),var(--tau-focus-ring)]" : "shadow-[0_0_0_1px_var(--tau-line-1)]"
                    )}
                  >
                    <p className={clsx("text-tau-body-lg min-h-[1.75em] leading-[1.75]", !draft && "text-ink-3")}>
                      {draft || "此刻在想什么？"}
                      {draft && <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />}
                    </p>
                    <div className="mt-1.5 flex min-h-7 items-center gap-1.5">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <span className="text-tau-sm text-ink-3 border-line-1 inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[7px] border border-dashed px-2">
                          <Hash className="size-3" strokeWidth={1.75} />
                          标签
                        </span>
                      </div>
                      {count > 0 && <span className="text-tau-sm text-ink-3 tabular-nums">{count} 字</span>}
                      <span data-hit="diary-send" className={clsx("grid size-7 place-items-center rounded-[9px]", count > 0 ? "bg-accent text-ink-inverse" : "text-ink-3")}>
                        <SendHorizontal className="size-[15px]" strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>
                  <div className="text-tau-sm text-ink-3 -mx-3.5 px-0.5 pt-1.5">
                    <span>↵ 发送 · ⇧↵ 换行 · # 标签</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
