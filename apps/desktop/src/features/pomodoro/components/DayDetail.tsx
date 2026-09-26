/**
 * 当天明细（账本面板右栏）：选中日的记录行 + 按预设分布。
 * 行尾时长可点修改；右键菜单改时长 / 删除（删除立即从视图消失，Toast 撤销，稍后才落库）。
 * 行内不放「更多」按钮：右栏窄，把位置让给预设名。
 */

import { Fragment, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { ContextMenu, Menu, cn } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import {
  dayLabel,
  formatDuration,
  formatDurationCN,
  formatHM,
  isEarlyStop,
  monthDayLabel,
  sumFocus,
  weekdayLabel,
  type SessionTiming,
} from "../model";
import { EarlyTag, PresetDot } from "./PomodoroBits";
import { DELETED_PRESET_NAME, presetDotClass } from "./presetTone";

export function DayDetail({
  dayStart,
  now,
  sessions,
  presetsById,
  live,
  liveTiming,
  onEditFocus,
  onDelete,
}: {
  dayStart: number;
  now: number;
  sessions: PomodoroSession[];
  presetsById: Map<number, PomodoroPreset>;
  /** 仅今天传入进行中的会话 */
  live: PomodoroSession | null;
  liveTiming: SessionTiming | null;
  onEditFocus(session: PomodoroSession, anchor: HTMLElement): void;
  onDelete(session: PomodoroSession): void;
}) {
  const total = sumFocus(sessions);
  const pauses = sessions.reduce((acc, s) => acc + s.pauseCount, 0);
  const first = sessions[sessions.length - 1];
  const last = sessions[0];
  const label = dayLabel(dayStart, now);
  const byPreset = new Map<number, number>();
  for (const s of sessions) byPreset.set(s.presetId, (byPreset.get(s.presetId) ?? 0) + s.focusMs);
  const mix = [...byPreset].sort((a, b) => b[1] - a[1]);
  const nameOf = (presetId: number) => presetsById.get(presetId)?.name ?? DELETED_PRESET_NAME;

  return (
    <aside className="flex min-h-0 flex-col pb-4 pl-3 pr-5 pt-4">
      <div className="px-2.5">
        <h2 className="text-tau-title flex items-baseline gap-2 font-semibold">
          {label}
          {label !== monthDayLabel(dayStart) && (
            <span className="text-ink-3 text-tau-sm font-normal">
              {monthDayLabel(dayStart)} {weekdayLabel(dayStart)}
            </span>
          )}
        </h2>
        <p className="text-ink-2 text-tau-meta mt-0.5 tabular-nums">
          {sessions.length ? (
            <>
              <b className="text-ink-1 font-semibold">{sessions.length}</b> 个 ·{" "}
              <b className="text-ink-1 font-semibold">{formatDurationCN(total)}</b> ·{" "}
              {formatHM(first.startTime)}–{formatHM(last.endTime ?? last.startTime)}
              {pauses > 0 && ` · 暂停 ${pauses} 次`}
            </>
          ) : live ? (
            "今天第一个番茄正在进行"
          ) : (
            "这一天没有专注记录"
          )}
        </p>
      </div>

      {/* -mr-1.5：FadeScroll 右侧 6px 透明边吃进 aside 内边距，列表与标题右缘对齐 */}
      <FadeScroll className="-mr-1.5 mt-2.5 min-h-0 flex-1 py-1">
        {live && liveTiming && (
          <div className="flex min-h-9 items-center gap-2.5 rounded-[9px] pl-2.5 pr-3">
            <span className="text-ink-2 text-tau-meta min-w-[11.5ch] flex-none whitespace-nowrap tabular-nums">
              {formatHM(live.startTime)}
              <span className="text-ink-3">–</span>
            </span>
            <PresetDot presetId={live.presetId} exists={presetsById.has(live.presetId)} />
            <span className="truncate font-medium">{nameOf(live.presetId)}</span>
            <span className="bg-accent-soft text-accent-text text-tau-micro inline-flex h-5 flex-none items-center rounded-[6px] px-1.5">
              {liveTiming.paused ? "已暂停" : "进行中"}
            </span>
            <span className="flex-1" />
            <span className="text-accent-text text-tau-meta font-medium tabular-nums">
              {formatDuration(liveTiming.elapsedMs)}
            </span>
          </div>
        )}
        {sessions.map(s => (
          <SessionRow
            key={s.id}
            session={s}
            name={nameOf(s.presetId)}
            exists={presetsById.has(s.presetId)}
            onEditFocus={onEditFocus}
            onDelete={onDelete}
          />
        ))}
      </FadeScroll>

      {mix.length > 0 && (
        <div className="px-2.5 pt-3.5">
          <h3 className="text-tau-body mb-2 font-semibold">按预设</h3>
          {/* 各行共用一张网格：名字列取最长名字（放不下才截断），进度条至少 56px，时长列按内容 */}
          <div className="text-ink-2 text-tau-sm grid auto-rows-[24px] grid-cols-[minmax(0,max-content)_minmax(56px,1fr)_auto] items-center gap-x-2.5">
            {mix.map(([presetId, ms]) => (
              <Fragment key={presetId}>
                <span
                  title={nameOf(presetId)}
                  className="flex min-w-0 items-center gap-1.5 whitespace-nowrap"
                >
                  <PresetDot presetId={presetId} exists={presetsById.has(presetId)} />
                  <span className="truncate">{nameOf(presetId)}</span>
                </span>
                <span className="bg-track h-1.5 overflow-hidden rounded-full">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      presetDotClass(presetId, presetsById.has(presetId))
                    )}
                    style={{ width: `${(ms / total) * 100}%` }}
                  />
                </span>
                <span className="text-ink-1 text-right tabular-nums">{formatDuration(ms)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function SessionRow({
  session,
  name,
  exists,
  onEditFocus,
  onDelete,
}: {
  session: PomodoroSession;
  name: string;
  exists: boolean;
  onEditFocus(session: PomodoroSession, anchor: HTMLElement): void;
  onDelete(session: PomodoroSession): void;
}) {
  const [durationEl, setDurationEl] = useState<HTMLButtonElement | null>(null);
  const menu = (
    <>
      <Menu.Item
        icon={<Clock className="size-[15px]" strokeWidth={1.75} />}
        onSelect={() => durationEl && onEditFocus(session, durationEl)}
      >
        修改专注时长
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        danger
        icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
        onSelect={() => onDelete(session)}
      >
        删除记录
      </Menu.Item>
    </>
  );
  return (
    <ContextMenu content={menu}>
      <div className="hover:bg-hover flex min-h-9 items-center gap-2 rounded-[9px] pl-2.5 pr-1">
        <span className="text-ink-2 text-tau-meta min-w-[11.5ch] flex-none whitespace-nowrap tabular-nums">
          {formatHM(session.startTime)}
          <span className="text-ink-3">–{formatHM(session.endTime ?? session.startTime)}</span>
        </span>
        <PresetDot presetId={session.presetId} exists={exists} />
        {/* min-w-0：名字随空间截断，整行不溢出——溢出量随时长文本变化会让各行右缘错位 */}
        <span
          title={name}
          className={cn("min-w-0 truncate", exists ? "font-medium" : "text-ink-3")}
        >
          {name}
        </span>
        {isEarlyStop(session) && <EarlyTag />}
        <button
          ref={setDurationEl}
          type="button"
          title="修改专注时长"
          onClick={e => onEditFocus(session, e.currentTarget)}
          className="text-tau-meta hover:text-accent-text ml-auto h-6 flex-none rounded-[7px] px-1.5 font-medium tabular-nums outline-none transition-colors duration-150 focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          {formatDuration(session.focusMs)}
        </button>
      </div>
    </ContextMenu>
  );
}
