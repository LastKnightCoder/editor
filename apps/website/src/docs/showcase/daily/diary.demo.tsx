/**
 * 日记：在纸底输入条写一句、回车发出，新条目落在「今天」顶部并闪一下；点标签只看这一类；
 * 点输入条上方的「一年前的今天」，从右侧滑出那年今日。
 * 结构按 features/diary 的 DaySection、MomentItem、Composer 与 OnThisDay 重建。
 */
import { useMemo, useState } from "react";
import { Hash, History, SendHorizontal, X } from "lucide-react";
import { Tag, cn, type TagColor } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Moment {
  id: number;
  day: number;
  time: string;
  text: string;
  tags: string[];
  fresh?: boolean;
}

const TAG_COLOR: Record<string, TagColor> = {
  读书: "blue",
  散步: "green",
  工作: "orange",
};

const INITIAL: Moment[] = [
  {
    id: 1,
    day: 26,
    time: "09:12",
    text: "早上读到一句：专注不是一种性格，而是一种可以练习的能力。",
    tags: ["读书"],
  },
  {
    id: 2,
    day: 26,
    time: "07:40",
    text: "河边走了一圈，桂花开了，空气是甜的。",
    tags: ["散步"],
  },
  {
    id: 3,
    day: 25,
    time: "22:05",
    text: "选题会上被问住了：我们到底想让读者带走什么？明天重写开头。",
    tags: ["工作"],
  },
  {
    id: 4,
    day: 25,
    time: "13:30",
    text: "午饭后困得不行，番茄钟开了两轮才缓过来。",
    tags: [],
  },
];

/** 那年今日：去年同一天写下的两条 */
const ECHOES = [
  {
    time: "07:55",
    text: "第一次试着早起读书，读了二十页《深度工作》，比想象中容易进入状态。",
    tags: ["读书"],
  },
  {
    time: "21:40",
    text: "决定每天睡前写一句日记，哪怕只有一句。",
    tags: [],
  },
];

const DAY_META: Record<number, { rel: string; week: string }> = {
  26: { rel: "今天", week: "周一" },
  25: { rel: "昨天", week: "周日" },
};

const nowTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

export default function DiaryDemo() {
  const [moments, setMoments] = useState(INITIAL);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teaseDismissed, setTeaseDismissed] = useState(false);

  const shown = channel ? moments.filter(moment => moment.tags.includes(channel)) : moments;
  const days = useMemo(
    () => [...new Set(shown.map(moment => moment.day))].sort((a, b) => b - a),
    [shown]
  );
  const count = text.trim().length;

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const tags = Array.from(body.matchAll(/#(\S+)/g), match => match[1]);
    setMoments(list => [
      {
        id: Date.now(),
        day: 26,
        time: nowTime(),
        text: body.replace(/#\S+/g, "").trim(),
        tags,
        fresh: true,
      },
      ...list.map(moment => ({ ...moment, fresh: false })),
    ]);
    setText("");
  };

  return (
    <AppWindow active="diary" crumb="日记" height={460}>
      <div className="flex h-full flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 px-8 pt-5 max-sm:px-4">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">日记</h3>
          {channel ? (
            <button
              type="button"
              onClick={() => setChannel(null)}
              className="text-ink-2 hover:text-ink-1 flex items-center gap-1"
            >
              <span className="text-ink-3">/</span>
              <Tag color={TAG_COLOR[channel] ?? "gray"}>{channel}</Tag>
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : (
            <span className="text-tau-meta text-ink-2">
              <b className="text-ink-1 font-semibold">{moments.length}</b> 条 · 连续记录{" "}
              <b className="text-ink-1 font-semibold">12</b> 天
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            title="那年今日"
            onClick={() => setDrawerOpen(open => !open)}
            className={cn(
              "text-ink-2 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[8px]",
              drawerOpen && "bg-accent-soft text-accent-text hover:bg-accent-soft"
            )}
          >
            <History className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[640px] px-10 pb-4 max-sm:px-4">
              {days.map(day => {
                const items = shown.filter(moment => moment.day === day);
                const words = items.reduce((sum, moment) => sum + moment.text.length, 0);
                return (
                  <section
                    key={day}
                    className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-[22px] pt-[22px] pb-1"
                  >
                    <div className="self-start pt-2">
                      <div className="text-tau-meta text-accent-text mb-1.5 font-medium">
                        {DAY_META[day].rel}
                      </div>
                      <div className="text-[32px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                        {day}
                      </div>
                      <div className="text-tau-meta text-ink-2 mt-1.5">
                        10月 · {DAY_META[day].week}
                      </div>
                      <div className="text-tau-tiny text-ink-3 mt-[3px] whitespace-nowrap tabular-nums">
                        {items.length} 条 · {words} 字
                      </div>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      {items.map(moment => (
                        <article
                          key={moment.id}
                          className={cn(
                            "hover:bg-hover relative -mx-3.5 rounded-[12px] px-3.5 pt-2.5 pb-3 transition-[background] duration-[700ms]",
                            moment.fresh && "animate-doc-flash"
                          )}
                        >
                          <div className="mb-1.5 flex h-[22px] items-center">
                            <span className="text-tau-meta text-ink-3 font-tau-mono font-medium tabular-nums">
                              {moment.time}
                            </span>
                          </div>
                          <p className="text-tau-body-lg leading-[1.75]">{moment.text}</p>
                          {moment.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {moment.tags.map(name => (
                                <button
                                  key={name}
                                  type="button"
                                  title={`只看「${name}」`}
                                  onClick={() => setChannel(name)}
                                  className="rounded-full hover:brightness-[0.97]"
                                >
                                  <Tag color={TAG_COLOR[name] ?? "gray"}>{name}</Tag>
                                </button>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="relative shrink-0 px-10 pt-2 pb-4 max-sm:px-4">
            <div className="from-surface pointer-events-none absolute inset-x-0 -top-7 h-7 bg-gradient-to-t to-transparent" />
            {!teaseDismissed && !channel && (
              <div className="mx-auto mb-1.5 grid max-w-[640px] grid-cols-[72px_minmax(0,1fr)] gap-x-[22px]">
                <span />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setDrawerOpen(true)}
                  onKeyDown={event =>
                    (event.key === "Enter" || event.key === " ") &&
                    (event.preventDefault(), setDrawerOpen(true))
                  }
                  className="text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 -mx-3.5 flex h-[30px] min-w-0 cursor-pointer items-center gap-2 rounded-[9px] pr-1.5 pl-3"
                >
                  <History className="text-accent-text size-[13px] shrink-0" strokeWidth={1.75} />
                  <b className="text-accent-text shrink-0 font-medium">一年前的今天</b>
                  <span className="min-w-0 flex-1 truncate">{ECHOES[0].text}</span>
                  <span className="text-tau-sm text-ink-3 shrink-0 max-sm:hidden">
                    还有 {ECHOES.length - 1} 条
                  </span>
                  <button
                    type="button"
                    title="今天不再提示"
                    onClick={event => {
                      event.stopPropagation();
                      setTeaseDismissed(true);
                    }}
                    className="text-ink-2 hover:bg-hover grid size-[22px] shrink-0 place-items-center rounded-[6px]"
                  >
                    <X className="size-3" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )}
            <div className="mx-auto grid max-w-[640px] grid-cols-[72px_minmax(0,1fr)] gap-x-[22px]">
              <div className="pt-2.5">
                <b className="text-tau-body block font-semibold">此刻</b>
                <span className="text-tau-meta text-ink-3 font-tau-mono tabular-nums">
                  {nowTime()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="bg-surface ease-tau-out relative -mx-3.5 rounded-[14px] px-3.5 pt-2.5 pb-2 shadow-[0_0_0_1px_var(--tau-line-1)] transition-[box-shadow] duration-[160ms] focus-within:shadow-[0_0_0_1px_var(--tau-accent),var(--tau-focus-ring)]">
                  <textarea
                    value={text}
                    rows={1}
                    aria-label="写一条日记"
                    onChange={event => setText(event.target.value)}
                    onKeyDown={event => {
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="此刻在想什么？"
                    className="text-tau-body-lg placeholder:text-ink-3 block w-full resize-none bg-transparent leading-[1.75] outline-none select-text"
                  />
                  <div className="mt-1.5 flex min-h-7 items-center gap-1.5">
                    <span className="text-tau-sm text-ink-3 border-line-1 inline-flex h-[22px] items-center gap-1 rounded-[7px] border border-dashed px-2">
                      <Hash className="size-3" strokeWidth={1.75} />
                      标签
                    </span>
                    <span className="flex-1" />
                    {count > 0 && (
                      <span className="text-tau-sm text-ink-3 tabular-nums">{count} 字</span>
                    )}
                    <button
                      type="button"
                      title="发送 (↵)"
                      disabled={!count}
                      onClick={submit}
                      className={cn(
                        "grid size-7 place-items-center rounded-[9px] transition-colors",
                        count ? "bg-accent text-ink-inverse hover:bg-accent-hover" : "text-ink-3"
                      )}
                    >
                      <SendHorizontal className="size-[15px]" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <div className="text-tau-sm text-ink-3 -mx-3.5 px-0.5 pt-1.5">
                  ↵ 发送 · ⇧↵ 换行 · # 标签
                </div>
              </div>
            </div>
          </div>

          <aside
            aria-label="那年今日"
            aria-hidden={!drawerOpen}
            inert={!drawerOpen || undefined}
            className={cn(
              "bg-surface shadow-float ease-tau-out absolute top-2.5 right-2.5 bottom-2.5 z-[9] flex w-[min(320px,calc(100%-20px))] flex-col rounded-[14px] outline outline-1 outline-[var(--tau-line-1)] transition-[transform,opacity] duration-[260ms]",
              drawerOpen
                ? "translate-x-0 opacity-100"
                : "pointer-events-none translate-x-3 opacity-0"
            )}
          >
            <div className="flex h-[52px] flex-none items-center gap-2 pr-2.5 pl-[18px]">
              <History className="text-accent-text size-[15px]" strokeWidth={1.75} />
              <b className="text-tau-body-lg font-semibold">那年今日</b>
              <span className="text-tau-meta text-ink-3">10月26日</span>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="关闭"
                title="关闭 (Esc)"
                onClick={() => setDrawerOpen(false)}
                className="text-ink-2 hover:bg-hover grid size-7 place-items-center rounded-[8px]"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-[18px] pb-[18px]">
              <div className="mb-1.5 flex items-baseline gap-2">
                <b className="font-tau-mono text-[15px] font-semibold">2025</b>
                <span className="text-tau-meta text-ink-3">一年前 · 周日</span>
              </div>
              {ECHOES.map(echo => (
                <div
                  key={echo.time}
                  title="在流里看这一条"
                  className="hover:bg-hover -mx-2.5 grid cursor-pointer grid-cols-[42px_minmax(0,1fr)] gap-2 rounded-[10px] py-2 pr-2.5 pl-1"
                >
                  <span className="text-tau-meta text-ink-3 font-tau-mono pt-1 tabular-nums">
                    {echo.time}
                  </span>
                  <div className="min-w-0">
                    <p className="text-tau-body leading-[1.75]">{echo.text}</p>
                    {echo.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {echo.tags.map(name => (
                          <Tag key={name} color={TAG_COLOR[name] ?? "gray"}>
                            {name}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </AppWindow>
  );
}
