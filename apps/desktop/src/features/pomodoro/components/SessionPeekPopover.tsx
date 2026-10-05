/**
 * 账本色块详情（Popover）：起止时刻、专注 / 预期、暂停分布条、关联对象（可跳转），操作 = 修改时长 / 删除。
 */

import { Clock, Trash2 } from "lucide-react";
import { Button, IconButton, Popover, cn } from "@tau/ui";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import {
  MINUTE_MS,
  dayLabel,
  formatDuration,
  formatDurationCN,
  formatHM,
  isEarlyStop,
} from "../model";
import { EarlyTag, PresetDot } from "./PomodoroBits";
import { DELETED_PRESET_NAME, presetDotClass } from "./presetTone";

export function SessionPeekPopover({
  session,
  anchor,
  now,
  preset,
  onClose,
  onEditFocus,
  onDelete,
  onOpenBinding,
}: {
  session: PomodoroSession | null;
  anchor: HTMLElement | null;
  now: number;
  preset: PomodoroPreset | undefined;
  onClose(): void;
  onEditFocus(session: PomodoroSession, anchor: HTMLElement): void;
  onDelete(session: PomodoroSession): void;
  /** 跳到关联的日程 / 待办 */
  onOpenBinding(session: PomodoroSession): void;
}) {
  const end = session ? (session.endTime ?? session.startTime) : 0;
  const span = session ? Math.max(1, end - session.startTime) : 1;
  return (
    <Popover
      anchor={anchor}
      open={session !== null && anchor !== null}
      onOpenChange={open => !open && onClose()}
      placement="bottom"
      arrow={false}
      className="w-[320px]"
    >
      {session && (
        <>
          <Popover.Header icon={<PresetDot presetId={session.presetId} exists={!!preset} />}>
            <span className="flex items-center gap-2">
              {preset?.name ?? DELETED_PRESET_NAME}
              {isEarlyStop(session) && <EarlyTag />}
            </span>
          </Popover.Header>
          <Popover.Body>
            {/* 专注条：暂停段在条上挖空 */}
            <div
              className={cn(
                "relative mb-2 mt-0.5 h-2.5 overflow-hidden rounded-full",
                presetDotClass(session.presetId, !!preset)
              )}
            >
              {session.pauses.map((p, i) => (
                <i
                  key={i}
                  className="bg-surface absolute inset-y-0 opacity-85"
                  style={{
                    left: `${((p.start - session.startTime) / span) * 100}%`,
                    width: `${(((p.end ?? end) - p.start) / span) * 100}%`,
                  }}
                />
              ))}
            </div>
            <dl className="text-tau-meta grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-ink-2">时间</dt>
              <dd className="text-ink-1 text-right">
                {dayLabel(session.startTime, now)} {formatHM(session.startTime)}–{formatHM(end)}
              </dd>
              <dt className="text-ink-2">专注</dt>
              <dd className="text-ink-1 text-right font-medium">
                {formatDurationCN(session.focusMs)}
                {session.expectedMs ? ` / ${Math.round(session.expectedMs / MINUTE_MS)} 分钟` : ""}
              </dd>
              {session.boundTitle && (
                <>
                  <dt className="text-ink-2">关联</dt>
                  <dd className="min-w-0 text-right">
                    <button
                      type="button"
                      title={`打开「${session.boundTitle}」`}
                      onClick={() => {
                        onClose();
                        onOpenBinding(session);
                      }}
                      className="text-accent-text max-w-full truncate hover:underline"
                    >
                      {session.boundTitle}
                    </button>
                  </dd>
                </>
              )}
              <dt className="text-ink-2">暂停</dt>
              <dd className="text-ink-1 text-right">
                {session.pauseCount
                  ? `${session.pauseCount} 次 · ${formatDuration(session.pauseTotalMs)}`
                  : "无"}
              </dd>
            </dl>
          </Popover.Body>
          <Popover.Footer className="justify-between">
            <IconButton
              aria-label="删除记录"
              title="删除记录"
              className="hover:text-danger size-7"
              onClick={() => {
                onClose();
                onDelete(session);
              }}
            >
              <Trash2 className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
            <Button
              variant="secondary"
              size="sm"
              icon={Clock}
              onClick={() => {
                const target = anchor;
                onClose();
                if (target) onEditFocus(session, target);
              }}
            >
              修改时长
            </Button>
          </Popover.Footer>
        </>
      )}
    </Popover>
  );
}
