/**
 * 番茄专注：悬停预设点 ▶ 开始，左栏换成播放器，可暂停、继续、结束；结束后记录落进右侧时间账本。
 * 示意把 25 分钟压成 25 秒走完，便于看到完整过程。结构按 features/pomodoro 的 FocusRail 与 Ledger 重建。
 */
import { useEffect, useRef, useState } from "react";
import { Expand, Music, Pause, PictureInPicture2, Play, Square } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Preset {
  id: number;
  name: string;
  minutes: number;
  dot: string;
  block: string;
}

const PRESETS: Preset[] = [
  { id: 1, name: "写作", minutes: 25, dot: "bg-accent", block: "bg-accent" },
  { id: 2, name: "具体数学", minutes: 50, dot: "bg-tag-2", block: "bg-tag-2" },
  { id: 3, name: "英语听力", minutes: 15, dot: "bg-tag-4", block: "bg-tag-4" },
];

interface Session {
  preset: number;
  /** 一天中的起止小时 */
  from: number;
  to: number;
}

const HISTORY: { label: string; week: string; sessions: Session[] }[] = [
  {
    label: "今天",
    week: "周一",
    sessions: [
      { preset: 1, from: 9, to: 9.42 },
      { preset: 2, from: 10.2, to: 11.05 },
    ],
  },
  {
    label: "昨天",
    week: "周日",
    sessions: [
      { preset: 3, from: 8.4, to: 8.7 },
      { preset: 1, from: 14, to: 14.42 },
      { preset: 1, from: 15, to: 15.42 },
    ],
  },
  {
    label: "10/24",
    week: "周六",
    sessions: [{ preset: 2, from: 19.5, to: 20.4 }],
  },
  {
    label: "10/23",
    week: "周五",
    sessions: [
      { preset: 1, from: 21, to: 21.42 },
      { preset: 3, from: 7.6, to: 7.9 },
    ],
  },
];

/** 账本横轴：6 点到 24 点 */
const AXIS_FROM = 6;
const AXIS_SPAN = 18;
const pct = (hour: number) => ((hour - AXIS_FROM) / AXIS_SPAN) * 100;
const NOW_HOUR = 16.5;
/** 示意里一分钟走一秒 */
const DEMO_SPEED = 60;

interface Live {
  preset: Preset;
  elapsed: number;
  paused: boolean;
}

const hm = (hour: number) =>
  `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function PomodoroDemo() {
  const [live, setLive] = useState<Live | null>(null);
  const [today, setToday] = useState(HISTORY[0].sessions);
  const [toast, setToast] = useState<string | null>(null);

  const total = live ? live.preset.minutes * 60 : 0;
  const running = live !== null && !live.paused;
  const finished = live !== null && live.elapsed >= total;

  const finish = (state: Live) => {
    const minutes = state.elapsed / 60;
    if (minutes < 5) setToast("不足 5 分钟，本次未记录");
    else {
      setToday(list => [
        ...list,
        {
          preset: state.preset.id,
          from: NOW_HOUR,
          to: NOW_HOUR + minutes / 60,
        },
      ]);
      setToast(`完成「${state.preset.name}」· ${Math.round(minutes)} 分钟`);
    }
    setLive(null);
  };

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setLive(state =>
        state && !state.paused
          ? {
              ...state,
              elapsed: Math.min(state.elapsed + DEMO_SPEED / 10, state.preset.minutes * 60),
            }
          : state
      );
    }, 100);
    return () => clearInterval(timer);
  }, [running]);

  // 走满时长自动结束；finish 每次渲染都是新函数，只在跨过终点那一刻触发
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (finished && live) finishRef.current(live);
  }, [finished, live]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const rows = [{ ...HISTORY[0], sessions: today }, ...HISTORY.slice(1)];

  return (
    <AppWindow active="pomodoro" crumb="番茄专注" height={420}>
      <div className="flex h-full flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 px-8 pt-5 max-sm:px-4">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">番茄专注</h3>
          <span className="text-tau-meta text-ink-2">
            今天 <b className="text-ink-1 font-semibold">{today.length}</b> 个 · 连续{" "}
            <b className="text-ink-1 font-semibold">9</b> 天
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] max-md:grid-cols-1">
          <aside className="flex min-h-0 flex-col pt-3 pr-4 pb-4 pl-6">
            {live ? (
              <section className="border-line-1 animate-doc-in relative overflow-hidden rounded-[18px] border px-5 pt-4 pb-4">
                <div className="flex items-center gap-[7px] font-semibold">
                  <span className={cn("size-2 rounded-full", live.preset.dot)} />
                  {live.preset.name}
                  <span
                    className={cn(
                      "text-tau-sm ml-auto font-medium",
                      live.paused ? "text-warn" : "text-accent-text"
                    )}
                  >
                    {live.paused ? "已暂停" : "剩余"}
                  </span>
                </div>
                <div className="mt-2 text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums">
                  {clock(total - live.elapsed)}
                </div>
                <div className="text-ink-2 text-tau-sm mt-2 tabular-nums">
                  {hm(NOW_HOUR)} 开始 → {hm(NOW_HOUR + live.preset.minutes / 60)} 结束
                </div>
                <div className="bg-track mt-3 h-[3px] overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-100 ease-linear",
                      live.paused ? "bg-warn" : "bg-accent"
                    )}
                    style={{ width: `${(live.elapsed / total) * 100}%` }}
                  />
                </div>
                <div className="text-ink-2 mt-3.5 flex items-center gap-0.5">
                  {[PictureInPicture2, Expand, Music].map((Icon, index) => (
                    <span key={index} className="grid size-[30px] place-items-center rounded-[8px]">
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                  ))}
                  <button
                    type="button"
                    aria-label="结束"
                    title="结束"
                    onClick={() => finish(live)}
                    className="hover:bg-hover grid size-[30px] place-items-center rounded-[8px]"
                  >
                    <Square className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label={live.paused ? "继续" : "暂停"}
                    onClick={() => setLive({ ...live, paused: !live.paused })}
                    className={cn(
                      "text-ink-inverse ml-auto grid size-[42px] place-items-center rounded-full transition-colors duration-150",
                      live.paused ? "bg-warn" : "bg-accent hover:bg-accent-hover"
                    )}
                  >
                    {live.paused ? (
                      <Play className="ml-0.5 size-[15px] fill-current" strokeWidth={0} />
                    ) : (
                      <Pause className="size-[15px] fill-current" strokeWidth={0} />
                    )}
                  </button>
                </div>
              </section>
            ) : (
              <div className="mb-2 px-2.5">
                <p className="text-tau-title font-semibold">开始专注</p>
                <p className="text-ink-3 text-tau-sm mt-0.5">点 ▶ 或数字键开始 · 点预设看详情</p>
              </div>
            )}
            <div className="mt-2 flex flex-col gap-0.5">
              {PRESETS.map((preset, index) => (
                <div
                  key={preset.id}
                  className="group/chip text-tau-body hover:bg-hover relative flex min-h-10 items-center gap-2 rounded-[10px] pr-2 pl-2.5 font-medium transition-[background] duration-150"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", preset.dot)} />
                  <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                  <span className="text-ink-3 text-tau-sm font-normal tabular-nums">
                    {preset.minutes}′
                  </span>
                  <span className="relative ml-0.5 grid size-[18px] place-items-center">
                    <kbd
                      className={cn(
                        "bg-hover text-ink-2 absolute inset-0 grid place-items-center rounded-[5px] font-mono text-[11px] leading-none transition-[opacity,transform] duration-150",
                        !live && "group-hover/chip:scale-75 group-hover/chip:opacity-0"
                      )}
                    >
                      {index + 1}
                    </kbd>
                    {!live && (
                      <button
                        type="button"
                        aria-label={`开始「${preset.name}」`}
                        onClick={() => setLive({ preset, elapsed: 0, paused: false })}
                        className="bg-accent text-ink-inverse hover:bg-accent-hover absolute -inset-[3px] grid scale-75 place-items-center rounded-full opacity-0 transition-[opacity,transform,background] duration-150 group-hover/chip:scale-100 group-hover/chip:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
                      >
                        <Play className="ml-px size-2.5 fill-current" strokeWidth={0} />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </aside>

          <section className="min-w-0 pt-3 pr-6 pb-4 max-md:hidden">
            <div className="mb-3 flex items-baseline gap-2.5">
              <p className="text-tau-title font-semibold">时间账本</p>
              <span className="text-tau-sm text-ink-3">近 7 天</span>
            </div>
            <div className="text-ink-3 text-tau-micro mb-1 grid grid-cols-[92px_minmax(0,1fr)]">
              <span />
              <span className="relative h-4">
                {[6, 12, 18, 24].map(hour => (
                  <span
                    key={hour}
                    className="absolute -translate-x-1/2 tabular-nums"
                    style={{ left: `${pct(hour)}%` }}
                  >
                    {hour}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {rows.map((row, rowIndex) => (
                <div
                  key={row.label}
                  className={cn(
                    "grid min-h-10 grid-cols-[92px_minmax(0,1fr)] items-center rounded-lg",
                    rowIndex === 0 && "bg-selected"
                  )}
                >
                  <span className="text-ink-2 text-tau-meta pl-2 whitespace-nowrap">
                    <b
                      className={cn(
                        "font-semibold",
                        rowIndex === 0 ? "text-accent-text" : "text-ink-1"
                      )}
                    >
                      {row.label}
                    </b>{" "}
                    {row.week}
                  </span>
                  <div className="relative h-full">
                    {[12, 18].map(hour => (
                      <i
                        key={hour}
                        className="bg-line-2 absolute inset-y-0 w-px"
                        style={{ left: `${pct(hour)}%` }}
                      />
                    ))}
                    {row.sessions.map((session, index) => {
                      const preset = PRESETS.find(item => item.id === session.preset);
                      if (!preset) return null;
                      return (
                        <i
                          key={index}
                          title={preset.name}
                          className={cn(
                            "absolute top-1/2 h-4 -translate-y-1/2 rounded-[4px] transition-transform hover:scale-y-[1.2]",
                            preset.block,
                            rowIndex === 0 &&
                              index === row.sessions.length - 1 &&
                              today.length > HISTORY[0].sessions.length &&
                              "animate-doc-in"
                          )}
                          style={{
                            left: `${pct(session.from)}%`,
                            width: `max(4px, ${pct(session.to) - pct(session.from)}%)`,
                          }}
                        />
                      );
                    })}
                    {live && rowIndex === 0 && (
                      <i
                        className={cn(
                          "absolute top-1/2 h-4 -translate-y-1/2 animate-pulse rounded-[4px] opacity-70",
                          live.preset.block
                        )}
                        style={{
                          left: `${pct(NOW_HOUR)}%`,
                          width: `max(4px, ${(live.elapsed / 3600 / AXIS_SPAN) * 100}%)`,
                        }}
                      />
                    )}
                    {rowIndex === 0 && (
                      <i
                        className="bg-ink-1 absolute inset-y-1.5 w-0.5 rounded-[1px]"
                        style={{ left: `${pct(NOW_HOUR)}%` }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {toast && (
        <div className="bg-surface shadow-float text-tau-sm animate-doc-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 whitespace-nowrap">
          {toast}
        </div>
      )}
    </AppWindow>
  );
}
