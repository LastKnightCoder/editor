import { pomoText, pomoValue, usePomodoroI18n, pomoFormat } from "../i18n";
/**
 * 时间账本：窗口内每天一行（新的在上）、横轴 6–24 点，色块 = 一段专注（暂停处留缺口），今天一行有「现在」刻度线。
 *
 * 行高随面板伸缩：天数少（7 天）时每行撑开到 52–104px，切换为加粗色块的「周视图」并补上当日个数；
 * 天数多时回落到 40px 紧凑行并滚动（长区间如「今年」同样按天列出）——任何区间面板都是满的，不留大片空白。
 * 底部「时段分布」与账本共用时间轴：半小时一桶累计区间内专注分钟，标出峰值时段；
 * 每桶整列高都是悬停热区（空桶也能指到）；Tooltip 受控、锚在柱顶，给出时段、累计与占比。
 */

import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, Tooltip, cn } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import {
  AXIS_FROM_HOUR,
  AXIS_TO_HOUR,
  DAY_MS,
  MINUTE_MS,
  axisPercent,
  focusDistribution,
  formatDuration,
  formatHM,
  startOfDay,
  sumFocus,
} from "../model";
import { listDays, windowDays, type DayWindow } from "../range";
import { PresetDot } from "./PomodoroBits";
import { presetDotClass } from "./presetTone";

const TICKS = Array.from(
  { length: (AXIS_TO_HOUR - AXIS_FROM_HOUR) / 3 + 1 },
  (_, i) => AXIS_FROM_HOUR + i * 3
);
const GRID_LINES = TICKS.slice(1, -1);
const pctOfHour = (hour: number) =>
  ((hour - AXIS_FROM_HOUR) / (AXIS_TO_HOUR - AXIS_FROM_HOUR)) * 100;
/** 行高达到该值即切换「周视图」 */
const TALL_ROW_PX = 52;

/**
 * 暂停段的挖空遮罩（相对色块自身的百分比）：宽度 ≤0.05% 的暂停不画（与原缺口一致）。
 * 无可见暂停段时返回 undefined，色块不加 mask。
 */
function pauseMask(
  s: PomodoroSession,
  dayStart: number,
  left: number,
  width: number,
  now: number
): string | undefined {
  const stops: string[] = [];
  for (const p of s.pauses) {
    const pl = axisPercent(p.start, dayStart);
    const pr = axisPercent(p.end ?? now, dayStart);
    if (pr - pl <= 0.05) continue;
    const rel = (axis: number) =>
      Math.max(0, Math.min(100, +(((axis - left) / width) * 100).toFixed(2)));
    const a = rel(pl);
    const b = rel(pr);
    stops.push(`#000 ${a}%`, `transparent ${a}%`, `transparent ${b}%`, `#000 ${b}%`);
  }
  if (!stops.length) return undefined;
  return `linear-gradient(to right, #000 0%, ${stops.join(", ")}, #000 100%)`;
}

export function Ledger({
  window: win,
  nav,
  now,
  days,
  presetsById,
  live,
  selectedDay,
  onSelectDay,
  highlight,
  onToggleHighlight,
  onOpenSession,
}: {
  window: DayWindow;
  /** 标题旁的时间导航 */
  nav: ReactNode;
  now: number;
  /** 日起点 → 当日会话（需覆盖窗口） */
  days: Map<number, PomodoroSession[]>;
  presetsById: Map<number, PomodoroPreset>;
  live: PomodoroSession | null;
  /** 打开明细抽屉的那天；null = 抽屉关闭，不标选中 */
  selectedDay: number | null;
  onSelectDay(dayStart: number): void;
  highlight: number | null;
  onToggleHighlight(presetId: number): void;
  onOpenSession(session: PomodoroSession, anchor: HTMLElement): void;
}) {
  usePomodoroI18n();

  const [rowsEl, setRowsEl] = useState<HTMLDivElement | null>(null);
  const [tall, setTall] = useState(false);

  const today = startOfDay(now);
  const range = windowDays(win);
  const dayStarts = useMemo(() => listDays(win), [win]);

  // 换窗口回到顶部（最新的一天）
  useEffect(() => {
    if (rowsEl) rowsEl.scrollTop = 0;
  }, [rowsEl, win.from, win.to]);

  useEffect(() => {
    if (!rowsEl) return;
    const measure = () => {
      const first = rowsEl.firstElementChild as HTMLElement | null;
      setTall(!!first && first.offsetHeight >= TALL_ROW_PX);
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(rowsEl);
    return () => ro?.disconnect();
  }, [rowsEl, range]);

  const inRange = useMemo(() => dayStarts.flatMap(d => days.get(d) ?? []), [dayStarts, days]);
  const total = sumFocus(inRange);

  return (
    <section className="flex min-h-0 flex-col pt-4 pr-2 pb-4 pl-8">
      <LedgerHeader
        title={pomoText("ui.focusLedger")}
        nav={nav}
        summary={pomoText("summary.range", {
          days: pomoValue(range),
          count: pomoValue(inRange.length),
          duration: pomoValue(formatDuration(total)),
          average: pomoValue(formatDuration(total / range)),
        })}
      />

      <div className="text-ink-3 grid h-6 grid-cols-[92px_minmax(0,1fr)_62px] pr-3 text-[11px] tabular-nums">
        <span />
        <div className="relative">
          {TICKS.map(hour => (
            <span
              key={hour}
              className="absolute top-[5px] -translate-x-1/2"
              style={{ left: `${pctOfHour(hour)}%` }}
            >
              {hour}:00
            </span>
          ))}
        </div>
      </div>

      {/* FadeScroll 右侧 6px 透明边 + pr-1.5 = 刻度行的 pr-3，行与刻度对齐 */}
      <FadeScroll
        scrollRef={setRowsEl}
        className={cn(
          "flex min-h-0 flex-1 flex-col pr-1.5",
          highlight != null && "[&_[data-block]:not([data-hl])]:opacity-[0.18]"
        )}
      >
        {dayStarts.map(dayStart => (
          <DayRow
            key={dayStart}
            dayStart={dayStart}
            now={now}
            tall={tall}
            sessions={days.get(dayStart) ?? []}
            live={dayStart === today ? live : null}
            presetsById={presetsById}
            selected={dayStart === selectedDay}
            highlight={highlight}
            onSelect={() => onSelectDay(dayStart)}
            onOpenSession={onOpenSession}
          />
        ))}
      </FadeScroll>

      <Distribution sessions={inRange} range={range} total={total} />

      <PresetLegend
        sessions={inRange}
        presetsById={presetsById}
        highlight={highlight}
        onToggle={onToggleHighlight}
        hint={pomoText("ui.selectABlockForDetailsSelectALegendTo")}
      />
    </section>
  );
}

export function LedgerHeader({
  title,
  nav,
  summary,
}: {
  title: string;
  nav?: ReactNode;
  summary: string;
}) {
  return (
    // 窄屏时标题与范围导航不压缩，只让右侧摘要省略
    <div className="mb-1.5 flex min-h-[30px] items-center gap-2">
      <h2 className="text-tau-title flex-none font-semibold whitespace-nowrap">{title}</h2>
      {nav}
      <span className="min-w-2 flex-1" />
      <span title={summary} className="text-ink-3 text-tau-sm min-w-0 truncate tabular-nums">
        {summary}
      </span>
    </div>
  );
}

/**
 * 预设图例：区间内各预设合计（按时长降序），点击高亮（再点取消）。
 * 只占一行：放不下的收进行尾「另外 N 个」，点开是完整可滚动列表；高亮项被收起时按钮直接显示它的名字。
 */
export function PresetLegend({
  sessions,
  presetsById,
  highlight,
  onToggle,
  hint,
}: {
  sessions: PomodoroSession[];
  presetsById: Map<number, PomodoroPreset>;
  highlight: number | null;
  onToggle(presetId: number): void;
  hint: string;
}) {
  usePomodoroI18n();

  const byPreset = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of sessions) map.set(s.presetId, (map.get(s.presetId) ?? 0) + s.focusMs);
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [sessions]);
  const [rowEl, setRowEl] = useState<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(byPreset.length);
  const [moreOpen, setMoreOpen] = useState(false);

  // 数出第一行放得下几个（换到第二行的即为溢出，容器限高一行并裁掉）
  useLayoutEffect(() => {
    if (!rowEl) return;
    const measure = () => {
      const chips = [...rowEl.children] as HTMLElement[];
      const top = chips[0]?.offsetTop ?? 0;
      const count = chips.findIndex(chip => chip.offsetTop > top);
      setVisibleCount(count < 0 ? chips.length : count);
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(rowEl);
    return () => ro?.disconnect();
  }, [rowEl, byPreset]);

  const hidden = byPreset.slice(visibleCount);
  const hiddenHighlight = highlight != null && hidden.some(([id]) => id === highlight);
  const nameOf = (id: number) => presetsById.get(id)?.name ?? pomoText("fallback.deletedPreset");

  const chip = ([presetId, ms]: [number, number], full = false) => (
    <button
      key={presetId}
      type="button"
      aria-pressed={highlight === presetId}
      onClick={() => {
        onToggle(presetId);
        if (full) setMoreOpen(false);
      }}
      className={cn(
        "text-tau-sm inline-flex h-[26px] items-center gap-1.5 rounded-lg px-2.5 tabular-nums transition-colors duration-150",
        full && "w-full justify-start",
        highlight === presetId
          ? "bg-selected text-accent-text font-medium"
          : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
    >
      <PresetDot presetId={presetId} exists={presetsById.has(presetId)} />
      <span className={cn(full && "min-w-0 flex-1 truncate text-left")}>{nameOf(presetId)}</span>
      <b className="text-ink-1 font-medium">{formatDuration(ms)}</b>
    </button>
  );

  return (
    <div className="flex flex-none items-center gap-1 pt-2.5 pr-3 pl-2">
      <div ref={setRowEl} className="flex h-[26px] min-w-0 flex-1 flex-wrap gap-1 overflow-hidden">
        {byPreset.map(entry => chip(entry))}
      </div>
      {hidden.length > 0 && (
        <Popover
          open={moreOpen}
          onOpenChange={setMoreOpen}
          placement="top-end"
          arrow={false}
          className="w-[300px]"
          trigger={
            <button
              type="button"
              className={cn(
                "text-tau-sm inline-flex h-[26px] flex-none items-center gap-1 rounded-lg px-2.5",
                hiddenHighlight
                  ? "bg-selected text-accent-text font-medium"
                  : "text-ink-2 hover:bg-hover hover:text-ink-1"
              )}
            >
              {hiddenHighlight ? (
                <>
                  <PresetDot presetId={highlight} exists={presetsById.has(highlight)} />
                  <span className="max-w-[10em] truncate">{nameOf(highlight)}</span>
                </>
              ) : (
                pomoText("legend.more", { count: pomoValue(hidden.length) })
              )}
              <ChevronDown className="size-3" strokeWidth={1.75} />
            </button>
          }
        >
          <Popover.Header>
            {pomoText("legend.allPresets", { count: pomoValue(byPreset.length) })}
          </Popover.Header>
          <Popover.Body className="px-2">
            <div className="flex flex-col gap-px">{byPreset.map(entry => chip(entry, true))}</div>
          </Popover.Body>
        </Popover>
      )}
      <span className="text-ink-3 text-tau-sm ml-2 flex-none whitespace-nowrap">{hint}</span>
    </div>
  );
}

function DayRow({
  dayStart,
  now,
  tall,
  sessions,
  live,
  presetsById,
  selected,
  highlight,
  onSelect,
  onOpenSession,
}: {
  dayStart: number;
  now: number;
  tall: boolean;
  sessions: PomodoroSession[];
  live: PomodoroSession | null;
  presetsById: Map<number, PomodoroPreset>;
  selected: boolean;
  highlight: number | null;
  onSelect(): void;
  onOpenSession(session: PomodoroSession, anchor: HTMLElement): void;
}) {
  usePomodoroI18n();

  const offset = Math.round((dayStart - startOfDay(now)) / DAY_MS);
  const date = new Date(dayStart);
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const total = sumFocus(sessions);
  const inset = tall ? "top-[24%] bottom-[24%] rounded-[6px]" : "top-2.5 bottom-2.5 rounded";
  // 点开详情浮层后静音该色块的 Tooltip（否则两者叠在一起），移出即恢复
  const [muted, setMuted] = useState<number | "live" | null>(null);

  const block = (s: PomodoroSession, isLive: boolean) => {
    const end = s.endTime ?? now;
    const left = axisPercent(s.startTime, dayStart);
    const width = Math.max(0.5, axisPercent(end, dayStart) - left);
    const preset = presetsById.get(s.presetId);
    const name = preset?.name ?? pomoText("fallback.deletedPreset");
    const key = isLive ? "live" : s.id;
    // 暂停段用 mask 挖成透明缺口（而非盖一层底色）：缺口随色块一起缩放，行 hover/选中的底色直接透出
    const mask = pauseMask(s, dayStart, left, width, now);
    return (
      // 进行中不可点但不设 disabled：Tooltip 对 disabled 子元素包 inline wrapper，绝对定位的色块会让锚点落空
      <Tooltip
        key={key}
        disabled={muted === key}
        delay={200}
        content={
          <span className="tabular-nums">
            <b className="font-semibold">{name}</b>
            <span className="block opacity-75">
              {isLive
                ? pomoText("status.startedAt", {
                    time: pomoValue(formatHM(s.startTime)),
                  })
                : pomoText("session.details", {
                    from: pomoValue(formatHM(s.startTime)),
                    to: pomoValue(formatHM(end)),
                    duration: pomoValue(pomoFormat.durationDetail(s.focusMs)),
                    pauses: pomoValue(
                      s.pauseCount
                        ? pomoText("status.pausesSuffix", { count: pomoValue(s.pauseCount) })
                        : ""
                    ),
                  })}
            </span>
          </span>
        }
      >
        <button
          type="button"
          data-block
          data-hl={highlight === s.presetId || undefined}
          aria-label={pomoText("session.dayRange", {
            day: pomoValue(name),
            from: pomoValue(formatHM(s.startTime)),
            to: pomoValue(isLive ? pomoText("state.running") : formatHM(end)),
          })}
          aria-disabled={isLive || undefined}
          onClick={e => {
            e.stopPropagation();
            if (isLive) return;
            setMuted(key);
            onOpenSession(s, e.currentTarget);
          }}
          onPointerLeave={() => setMuted(m => (m === key ? null : m))}
          className={cn(
            "absolute min-w-1 transition-[opacity,transform] duration-150",
            isLive ? "animate-pulse cursor-default" : "hover:scale-y-[1.2]",
            inset,
            presetDotClass(s.presetId, !!preset)
          )}
          style={{
            left: `${left}%`,
            width: `${width}%`,
            ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : null),
          }}
        />
      </Tooltip>
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "grid max-h-[104px] min-h-10 flex-[1_0_40px] cursor-pointer grid-cols-[92px_minmax(0,1fr)_62px] items-center rounded-lg transition-colors duration-150",
        selected ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <span
        className={cn(
          "text-ink-2 text-tau-meta whitespace-nowrap pl-2",
          tall && "flex flex-col leading-[1.35]"
        )}
      >
        <span>
          <b
            className={cn(
              "font-semibold",
              selected ? "text-accent-text" : "text-ink-1",
              tall && "text-tau-body"
            )}
          >
            {offset === 0
              ? pomoText("ui.today")
              : offset === -1
                ? pomoText("ui.yesterday")
                : date.getFullYear() !== new Date(now).getFullYear()
                  ? `${String(date.getFullYear()).slice(2)}/${date.getMonth() + 1}/${date.getDate()}`
                  : `${date.getMonth() + 1}/${date.getDate()}`}
          </b>{" "}
          <span className={cn(weekend && "text-ink-3", tall && "text-tau-sm")}>
            {pomoFormat.weekday(dayStart)}
          </span>
        </span>
        {tall && (
          <span className="text-ink-3 text-tau-micro">
            {sessions.length
              ? pomoText("summary.tomatoes", { count: pomoValue(sessions.length) })
              : pomoText("ui.noRecords")}
          </span>
        )}
      </span>
      <div className="relative h-full">
        {GRID_LINES.map(hour => (
          <i
            key={hour}
            aria-hidden
            className="bg-line-2 absolute inset-y-0 w-px"
            style={{ left: `${pctOfHour(hour)}%` }}
          />
        ))}
        {[...sessions].reverse().map(s => block(s, false))}
        {live && block(live, true)}
        {offset === 0 && (
          <i
            aria-hidden
            className={cn(
              "bg-ink-1 absolute -ml-px w-0.5 rounded-[1px]",
              tall ? "inset-y-[12%]" : "inset-y-[3px]"
            )}
            style={{ left: `${axisPercent(now, dayStart)}%` }}
          />
        )}
      </div>
      <span
        className={cn(
          "text-tau-meta pr-1.5 text-right tabular-nums",
          total ? "text-ink-1 font-medium" : "text-ink-3"
        )}
      >
        {total ? formatDuration(total) : "—"}
      </span>
    </div>
  );
}

function Distribution({
  sessions,
  range,
  total,
}: {
  sessions: PomodoroSession[];
  range: number;
  total: number;
}) {
  usePomodoroI18n();

  const buckets = useMemo(() => focusDistribution(sessions), [sessions]);
  const max = Math.max(...buckets, 1);
  const peak = buckets.indexOf(Math.max(...buckets));
  const hasData = buckets.some(Boolean);
  const label = (index: number) => {
    const hour = AXIS_FROM_HOUR + index / 2;
    return `${Math.floor(hour)}:${hour % 1 ? "30" : "00"}`;
  };
  const width = 100 / buckets.length;
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="mt-1.5 mr-3 grid h-[58px] flex-none grid-cols-[92px_minmax(0,1fr)_62px] items-end pt-1.5">
      <span className="self-center pl-2 leading-[1.35]">
        <b className="text-ink-1 text-tau-meta block font-semibold">
          {pomoText("ui.timeDistribution")}
        </b>
        <span className="text-accent-text text-tau-micro whitespace-nowrap tabular-nums">
          {hasData
            ? pomoText("summary.peak", {
                from: pomoValue(label(peak)),
                to: pomoValue(label(peak + 1)),
              })
            : pomoText("ui.noData")}
        </span>
      </span>
      <div className="relative h-full">
        {buckets.map((minutes, i) => (
          <span
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(h => (h === i ? null : h))}
            className="absolute inset-y-0"
            style={{ left: `${i * width}%`, width: `${width}%` }}
          >
            <Tooltip
              open={hovered === i}
              content={
                <span className="tabular-nums">
                  <b className="font-semibold">
                    {label(i)}–{label(i + 1)}
                  </b>
                  <span className="block opacity-75">
                    {minutes
                      ? pomoText("summary.distribution", {
                          duration: pomoValue(pomoFormat.durationDetail(minutes * MINUTE_MS)),
                          percent: pomoValue(
                            Math.max(1, Math.round((minutes * MINUTE_MS * 100) / total))
                          ),
                        })
                      : pomoText("ui.noFocus")}
                  </span>
                </span>
              }
            >
              <i
                className={cn(
                  "absolute inset-x-px bottom-0 rounded-b-[1px] rounded-t-[3px] transition-colors duration-150",
                  !minutes
                    ? cn("h-0.5", hovered === i ? "bg-line-1" : "bg-track")
                    : i === peak
                      ? hovered === i
                        ? "bg-accent-hover"
                        : "bg-accent"
                      : hovered === i
                        ? "bg-[color-mix(in_srgb,var(--tau-accent)_55%,var(--tau-bg-track))]"
                        : "bg-[color-mix(in_srgb,var(--tau-accent)_32%,var(--tau-bg-track))]"
                )}
                style={{
                  height: minutes ? `${Math.max(6, (minutes / max) * 78)}%` : undefined,
                }}
              />
            </Tooltip>
          </span>
        ))}
      </div>
      <span className="text-tau-meta self-center pr-1.5 text-right leading-[1.35] font-semibold whitespace-nowrap tabular-nums">
        {formatDuration(total)}
        <span className="text-ink-3 block text-[11px] font-normal">
          {pomoText("ui.dailyAverage")} {formatDuration(total / range)}
        </span>
      </span>
    </div>
  );
}
