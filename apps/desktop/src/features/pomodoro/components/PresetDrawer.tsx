import { pomoText, pomoValue, usePomodoroI18n, pomoFormat } from "../i18n";
/**
 * 预设详情抽屉（非模态 Drawer，盖在账本右侧；点左栏预设行打开，Esc 经页面浮层仲裁关闭）：
 * 开始按钮 → 近 WINDOW_DAYS 天概况（个数 / 累计 / 日均 / 最近一次）→ 近 14 天每日柱 → 按天分组的记录。
 * 记录行与当天明细同款：点时长修改，右键改时长 / 删除。
 */

import { Archive, Pencil, Play } from "lucide-react";
import { Button, Drawer, IconButton, Tooltip, cn, useRetainedValue } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import {
  DAY_MS,
  formatClock,
  formatDuration,
  groupByDay,
  startOfDay,
  sumFocus,
  type SessionTiming,
} from "../model";
import { WINDOW_DAYS } from "../queries";
import { PresetDot } from "./PomodoroBits";
import { SessionRow } from "./DayDrawer";
import { presetDotClass } from "./presetTone";

const TREND_DAYS = 14;

export function PresetDrawer({
  preset,
  now,
  sessions,
  live,
  liveTiming,
  onClose,
  onStart,
  onEdit,
  onArchive,
  onEditFocus,
  onDelete,
}: {
  /** null = 关闭 */
  preset: PomodoroPreset | null;
  now: number;
  /** 该预设近 WINDOW_DAYS 天的会话（降序） */
  sessions: PomodoroSession[];
  /** 进行中的会话（任意预设）：有则不可开始 */
  live: PomodoroSession | null;
  liveTiming: SessionTiming | null;
  onClose(): void;
  onStart(preset: PomodoroPreset): void;
  onEdit(preset: PomodoroPreset, anchor: HTMLElement): void;
  onArchive(preset: PomodoroPreset): void;
  onEditFocus(session: PomodoroSession, anchor: HTMLElement): void;
  onDelete(session: PomodoroSession): void;
}) {
  usePomodoroI18n();

  useOverlayDismiss(onClose, preset !== null);
  /* 关闭时保留最后一个预设做退场动画 */
  const current = useRetainedValue(preset);

  const total = sumFocus(sessions);
  const days = groupByDay(sessions);
  const today = startOfDay(now);
  const trend = Array.from({ length: TREND_DAYS }, (_, i) => {
    const day = today - (TREND_DAYS - 1 - i) * DAY_MS;
    return { day, ms: sumFocus(days.get(day) ?? []) };
  });
  const trendMax = Math.max(...trend.map(t => t.ms), 1);
  const liveHere = live && current && live.presetId === current.id;

  return (
    <Drawer
      modal={false}
      open={preset !== null}
      onOpenChange={next => !next && onClose()}
      size="sm"
      label={pomoText("ui.presetDetails")}
      icon={current && <PresetDot presetId={current.id} className="mt-[9px] size-2.5" />}
      title={current?.name}
      subtitle={
        current &&
        (current.mode === "countdown"
          ? pomoText("mode.countdownMinutes", { minutes: pomoValue(current.durationMin) })
          : pomoText("mode.countupManual"))
      }
      actions={
        current && (
          <>
            <Tooltip content={pomoText("ui.editPreset")}>
              <IconButton
                aria-label={pomoText("ui.editPreset")}
                onClick={e => onEdit(current, e.currentTarget)}
              >
                <Pencil className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            <Tooltip content={pomoText("ui.archive")}>
              <IconButton
                aria-label={pomoText("ui.archivePreset")}
                onClick={() => onArchive(current)}
              >
                <Archive className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          </>
        )
      }
      bodyClassName="pl-3"
    >
      {current && (
        <>
          <div className="px-2.5">
            {liveHere && liveTiming ? (
              <div className="bg-accent-soft text-accent-text text-tau-body flex h-10 items-center justify-center gap-2 rounded-[10px] font-medium tabular-nums">
                {liveTiming.paused ? pomoText("state.paused") : pomoText("state.focusingNow")} ·{" "}
                {formatClock(liveTiming.displayMs)}
              </div>
            ) : (
              <Button
                variant="primary"
                block
                icon={Play}
                disabled={live !== null}
                onClick={() => onStart(current)}
              >
                {live
                  ? pomoText("ui.endTheCurrentSessionBeforeStartingAnother")
                  : pomoText("ui.startFocusSession")}
              </Button>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat
                label={pomoText("range.lastDays", { days: pomoValue(WINDOW_DAYS) })}
                value={pomoText("summary.sessionCount", { count: pomoValue(sessions.length) })}
              />
              <Stat label={pomoText("ui.totalFocus2")} value={formatDuration(total)} />
              <Stat
                label={pomoText("ui.mostRecent")}
                value={sessions.length ? pomoFormat.day(sessions[0].startTime, now) : "—"}
              />
            </div>

            <h3 className="text-tau-body mt-5 mb-2 flex items-baseline font-semibold">
              {pomoText("range.lastDays", { days: pomoValue(TREND_DAYS) })}
              <span className="text-ink-3 text-tau-sm ml-auto font-normal tabular-nums">
                {pomoText("ui.dailyAverage")}{" "}
                {formatDuration(sumFocus(trend.flatMap(t => days.get(t.day) ?? [])) / TREND_DAYS)}
              </span>
            </h3>
            <div className="flex h-14 items-end gap-[3px]">
              {trend.map(({ day, ms }) => (
                <Tooltip
                  key={day}
                  delay={150}
                  content={
                    <span className="tabular-nums">
                      {pomoFormat.monthDay(day)} {pomoFormat.weekday(day)} ·{" "}
                      {ms ? pomoFormat.durationDetail(ms) : pomoText("ui.noFocus")}
                    </span>
                  }
                >
                  <span className="flex h-full flex-1 items-end">
                    <span
                      className={cn(
                        "w-full rounded-b-[1px] rounded-t-[3px]",
                        ms ? presetDotClass(current.id) : "bg-track h-0.5"
                      )}
                      style={ms ? { height: `${Math.max(8, (ms / trendMax) * 100)}%` } : undefined}
                    />
                  </span>
                </Tooltip>
              ))}
            </div>

            <h3 className="text-tau-body mt-5 mb-1 font-semibold">{pomoText("ui.records")}</h3>
          </div>

          {sessions.length === 0 ? (
            <p className="text-ink-3 text-tau-meta px-2.5 py-2">
              {pomoText("empty.presetRange", { days: pomoValue(WINDOW_DAYS) })}
            </p>
          ) : (
            [...days].map(([day, list]) => (
              <section key={day} className="mt-2">
                <div className="text-ink-3 text-tau-sm flex items-baseline px-2.5 py-1 tabular-nums">
                  <span className="text-ink-2 font-medium">{pomoFormat.day(day, now)}</span>
                  <span className="ml-1.5">{pomoFormat.weekday(day)}</span>
                  <span className="ml-auto">{formatDuration(sumFocus(list))}</span>
                </div>
                {list.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    name={current.name}
                    exists
                    onEditFocus={onEditFocus}
                    onDelete={onDelete}
                  />
                ))}
              </section>
            ))
          )}
        </>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-hover rounded-[10px] px-3 py-2">
      <div className="text-ink-3 text-tau-micro">{label}</div>
      <div className="text-ink-1 text-tau-body mt-0.5 truncate font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}
