/**
 * 番茄专注重建：结构摘自 features/pomodoro（PomodoroView / FocusRail 播放器 / Ledger 时间账本）。
 * elapsed 为已专注秒数，驱动大数字与进度线；idle 为未专注态（「开始专注」+ 预设列表）。
 * 有绑定时播放器主标题是绑定对象、预设名降为灰字（FocusRail Player）；缺省数据是场景片的。
 */
import clsx from "clsx";
import { Archive, Expand, Link2, Music, Pause, PictureInPicture2, Plus, Square } from "lucide-react";
import { Button, IconButton } from "@tau/ui";
import { PageToolbar, PaperPage, Num, Sep } from "../parts/PageHeader";
import { POMODORO } from "../../mock/day";

export type PomodoroData = typeof POMODORO & {
  span?: string;
  /** 工具栏摘要：今天个数、时长、连续天数 */
  summary?: [string, string, number];
  ledgerSummary?: string;
  /** 播放器主标题用绑定对象（真实界面有绑定时如此） */
  boundTitle?: boolean;
};

export function PomodoroPage({
  elapsed = 0,
  data = POMODORO,
  idle = false,
  session,
}: {
  elapsed?: number;
  data?: PomodoroData;
  idle?: boolean;
  /** 刚做完的一次：落在账本今天那一行，appear 0→1 */
  session?: { block: [number, number, string]; appear: number; total?: string };
}) {
  const total = data.minutes * 60;
  const left = Math.max(0, total - elapsed);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(Math.floor(left % 60)).padStart(2, "0");
  return (
    <PaperPage>
      <PageToolbar
        title="番茄专注"
        summary={
          <>
            今天 <Num>{data.summary?.[0] ?? 3}</Num> 个<Sep />
            <Num>{data.summary?.[1] ?? "1h 15m"}</Num>
            <Sep />
            连续 <Num>{data.summary?.[2] ?? 42}</Num> 天
          </>
        }
      >
        <IconButton>
          <Archive size={16} strokeWidth={1.75} />
        </IconButton>
        <Button variant="primary" size="sm" icon={Plus}>
          新建预设
        </Button>
      </PageToolbar>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col pt-3 pr-4 pb-4 pl-6">
          {idle ? (
            <div className="mb-2 px-2.5">
              <h2 className="text-tau-title font-semibold">开始专注</h2>
              <p className="text-ink-3 text-tau-sm mt-0.5">点 ▶ 或数字键开始 · 点预设看详情</p>
              <div className="text-tau-sm -mx-2 mt-1.5 flex min-h-7 w-[calc(100%+16px)] min-w-0 items-center gap-1.5 rounded-[8px] px-2">
                <Link2 size={13} strokeWidth={1.75} className="text-ink-3" />
                <span className="text-ink-3 shrink-0 whitespace-nowrap">专注于</span>
                <span className="text-ink-3 truncate">… 可选</span>
              </div>
            </div>
          ) : (
            <section className="border-line-1 relative flex-none overflow-hidden rounded-[18px] border px-5 pt-4 pb-4">
              <div className="flex items-center gap-[7px] font-semibold">
                <i className="bg-accent size-2 shrink-0 rounded-full" />
                <span className="min-w-0 truncate">{data.boundTitle ? data.bind : data.preset}</span>
                {data.boundTitle && <span className="text-ink-3 text-tau-sm min-w-[3em] shrink truncate font-normal">{data.preset}</span>}
                <span className="text-tau-sm text-accent-text ml-auto flex-none font-medium">剩余</span>
              </div>
              <div className="mt-2 text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums">
                {mm}:{ss}
              </div>
              <div className="text-ink-2 text-tau-sm mt-2 truncate whitespace-nowrap tabular-nums">{data.span ?? "14:00 开始 → 14:25 结束"}</div>
              <div className="text-tau-sm -mx-2 mt-1.5 flex min-h-7 w-[calc(100%+16px)] min-w-0 items-center gap-1.5 rounded-[8px] px-2">
                <Link2 size={13} strokeWidth={1.75} className="text-ink-3" />
                <span className="text-ink-3 shrink-0 whitespace-nowrap">专注于</span>
                <span className="truncate">{data.bind}</span>
              </div>
              <div className="bg-track mt-3 h-[3px] overflow-hidden rounded-full">
                <div className="bg-accent h-full rounded-full" style={{ width: `${(elapsed / total) * 100}%` }} />
              </div>
              <div className="mt-3.5 flex items-center gap-0.5">
                {[PictureInPicture2, Expand, Music, Square].map((Icon, i) => (
                  <IconButton key={i}>
                    <Icon className="size-4" strokeWidth={1.75} />
                  </IconButton>
                ))}
                <span className="bg-accent text-ink-inverse ml-auto grid size-[42px] flex-none place-items-center rounded-full">
                  <Pause className="size-[15px] fill-current" strokeWidth={0} />
                </span>
              </div>
            </section>
          )}
          {!idle && <div className="text-ink-3 text-tau-sm mt-5 mb-1 px-2.5">预设 · 结束当前专注后可开始</div>}
          <div className="flex flex-col gap-px py-1">
            {data.presets.map((p, i) => (
              <div key={p.name} className={clsx("text-tau-body relative flex min-h-10 w-full items-center gap-2 rounded-[10px] pr-2 pl-2.5 font-medium", i === 0 && "bg-selected")}>
                <i className={clsx("size-2 shrink-0 rounded-full", p.dot)} />
                <span className={clsx("min-w-0 flex-1 truncate", i === 0 && "text-accent-text")}>{p.name}</span>
                <span className="text-ink-3 text-tau-sm flex-none font-normal tabular-nums">{p.len}</span>
                <kbd className="bg-hover text-ink-2 grid size-[18px] place-items-center rounded-[5px] font-mono text-[11px] leading-none">{i + 1}</kbd>
              </div>
            ))}
          </div>
        </aside>
        <section className="flex min-h-0 flex-col pt-4 pr-6 pb-4 pl-8">
          <div className="mb-1.5 flex min-h-[30px] items-center gap-2">
            <h2 className="text-tau-title flex-none font-semibold whitespace-nowrap">时间账本</h2>
            <span className="text-ink-3 text-tau-sm min-w-0 truncate tabular-nums">{data.ledgerSummary ?? "14 天 · 23 个 · 9h 40m · 日均 41m"}</span>
          </div>
          <div className="text-ink-3 grid h-6 grid-cols-[92px_minmax(0,1fr)_62px] pr-3 text-[11px] tabular-nums">
            <span />
            <span className="flex justify-between">
              {["6:00", "9:00", "12:00", "15:00", "18:00", "21:00", "24:00"].map(t => (
                <span key={t}>{t}</span>
              ))}
            </span>
          </div>
          {data.ledger.map((day, row) => (
            <div key={day.label} className="grid max-h-[104px] min-h-10 flex-[1_0_40px] grid-cols-[92px_minmax(0,1fr)_62px] items-center rounded-lg">
              <span className="text-ink-2 text-tau-meta pl-2 whitespace-nowrap">
                <b className="text-ink-1 font-semibold">{day.label}</b> {day.week}
              </span>
              <span className="relative h-full">
                {[1, 2, 3, 4, 5].map(i => (
                  <i key={i} className="bg-line-2 absolute inset-y-0 w-px" style={{ left: `${(i / 6) * 100}%` }} />
                ))}
                {[...day.blocks.map(b => ({ b, t: 1 })), ...(row === 0 && session && session.appear > 0 ? [{ b: session.block, t: session.appear }] : [])].map(({ b: [from, to, color], t }, i) => (
                  <i
                    key={i}
                    className={clsx("absolute top-2.5 bottom-2.5 min-w-1 rounded", color)}
                    style={{ left: `${((from - 6) / 18) * 100}%`, width: `${((to - from) / 18) * 100}%`, opacity: Math.min(1, t * 1.5), transform: t < 1 ? `scaleY(${0.6 + 0.4 * t})` : undefined }}
                  />
                ))}
              </span>
              <span className="text-tau-meta text-ink-1 pr-1.5 text-right font-medium tabular-nums">{row === 0 && session?.total && session.appear > 0.5 ? session.total : day.total}</span>
            </div>
          ))}
        </section>
      </div>
    </PaperPage>
  );
}
