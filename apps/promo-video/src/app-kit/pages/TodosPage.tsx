/**
 * 待办重建：结构摘自 features/todos（TodosView / QuickAddBar / AgendaPanel / TodoBits）。
 * 缺省数据是场景片的；checking 为正在勾掉的一条（t 0→1：圈填满、标题划掉）。
 */
import clsx from "clsx";
import { Check, ChevronDown, Flag, ListChecks, Repeat, Sparkles } from "lucide-react";
import { Button } from "@tau/ui";
import { PageToolbar, PaperPage, Num, Sep } from "../parts/PageHeader";
import { SegmentedLook } from "../parts/Segmented";
import { TODO_GROUPS } from "../../mock/day";

export function TodosPage({
  doneCount = 0,
  groups = TODO_GROUPS,
  summary = { today: 5, checkin: "2/3" },
  checking,
  fold,
}: {
  doneCount?: number;
  groups?: typeof TODO_GROUPS;
  summary?: { today: number; checkin: string };
  checking?: { title: string; t: number };
  /** 真实列表：已完成收进段尾「已完成 N」折叠，正在勾掉的一条完成后让位收起；now 为今天段的「现在」刻度 */
  fold?: { now: string };
}) {
  let index = 0;
  return (
    <PaperPage>
      <PageToolbar
        title="待办"
        summary={
          <>
            今天 <Num>{summary.today}</Num> 项<Sep />
            打卡 <Num>{summary.checkin}</Num>
          </>
        }
      >
        <Button variant="ghost" size="sm" icon={ListChecks}>
          今日
        </Button>
        <SegmentedLook items={["按日期", "按项目"]} active={0} />
      </PageToolbar>
      <div className="px-8">
        <div className="border-line-1 mb-3 flex flex-none flex-col rounded-[14px] border">
          <div className="flex h-11 items-center gap-2.5 pr-2 pl-3.5">
            <Sparkles className="text-accent size-4" strokeWidth={1.75} />
            <span className="text-tau-body-lg text-ink-3 min-w-0 flex-1 truncate">添加任务：试试「明天 17:00 交周报 #项目」或「每周一、四 周会」</span>
            <kbd className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-0.5 font-mono text-[11px]">⌘/</kbd>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col pl-2.5">
        <div className="relative mb-4 min-h-0 min-w-0 flex-1 overflow-hidden pr-8 pb-6 pl-[22px]">
          {groups.map(group => {
            const leaving = (title: string) => (checking?.title === title ? Math.min(1, Math.max(0, (checking.t - 0.55) / 0.45)) : 0);
            const isDone = (item: (typeof group.items)[number]) => item.done || (checking?.title === item.title && checking.t >= 1);
            const shown = fold ? group.items.filter(item => !isDone(item)) : group.items;
            const doneHere = fold ? group.items.filter(isDone).length : 0;
            const openCount = group.items.length - doneHere;
            return (
              <section key={group.title} className="relative mb-[18px]">
                <header className="-mx-1.5 flex items-baseline gap-2.5 px-2.5 pt-1.5 pb-2.5">
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">{group.title}</span>
                  <span className="text-ink-3 text-[11.5px]">{group.sub}</span>
                  <span className="text-ink-3 ml-auto text-[11.5px] tabular-nums">
                    {fold ? openCount : group.items.length} 项{doneHere > 0 && ` · ${doneHere} 已完成`}
                  </span>
                </header>
                <div className="-mx-1.5">
                  {fold && group.title === "今天" && (
                    <div className="text-accent-text after:bg-accent mx-2.5 my-px flex items-center gap-1.5 text-[10.5px] tabular-nums after:h-[1.5px] after:flex-1 after:rounded-[1px] after:opacity-55 after:content-['']">
                      现在 {fold.now}
                    </div>
                  )}
                  {shown.map(item => {
                    const done = index++ < doneCount || item.done || (checking?.title === item.title && checking.t >= 0.25);
                    const out = leaving(item.title);
                    return (
                      <div key={item.title} className="overflow-hidden" style={out > 0 ? { height: 48 * (1 - out), opacity: 1 - out } : undefined}>
                        <div className="grid min-h-[42px] grid-cols-[74px_22px_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] py-[3px] pr-2.5 pl-2">
                          <span className="flex min-w-0 flex-col leading-[1.25]">
                            <span className={clsx("truncate text-[12.5px] font-medium tabular-nums", done ? "text-ink-3" : item.today ? "text-accent-text" : "text-ink-1")}>{item.time}</span>
                            <span className="text-ink-3 truncate text-[10.5px]">{item.slot}</span>
                          </span>
                          <span
                            data-hit={`todo-check:${item.title}`}
                            className={clsx(
                              "grid size-[17px] place-items-center rounded-full border-[1.5px]",
                              done ? (item.kind === "repeat" ? "border-ok bg-ok text-ink-inverse" : "border-accent bg-accent text-ink-inverse") : "border-ink-3 text-transparent",
                              !done && item.kind === "repeat" && "border-dashed"
                            )}
                          >
                            <Check className="size-[11px]" strokeWidth={3} />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className={clsx("text-tau-body truncate", done && item.kind !== "repeat" && "text-ink-3 line-through")}>{item.title}</span>
                          </span>
                          <span className="flex items-center gap-2.5">
                            <span className="text-ink-2 flex items-center gap-1.5 text-[11.5px] whitespace-nowrap">
                              <i className={clsx("size-[7px] rounded-[2.5px]", item.dot)} />
                              {item.project}
                            </span>
                            {item.kind === "deadline" && <Flag className="text-warn size-[13px] shrink-0" strokeWidth={1.75} />}
                            {item.kind === "repeat" && <Repeat className="text-ok size-[13px] shrink-0" strokeWidth={1.75} />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {doneHere > 0 && (
                    <div className="text-ink-3 flex items-center gap-1.5 pt-1.5 pr-3.5 pb-1 pl-3.5 text-[11.5px]">
                      <ChevronDown className="size-[13px] -rotate-90" strokeWidth={1.75} />
                      已完成 {doneHere}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PaperPage>
  );
}
