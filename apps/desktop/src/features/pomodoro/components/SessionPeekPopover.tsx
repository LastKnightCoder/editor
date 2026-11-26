import { pomoText, pomoValue, usePomodoroI18n, pomoFormat } from "../i18n";
/**
 * 账本色块详情（Popover）：起止时刻、专注 / 预期、暂停分布条、关联对象（可跳转），操作 = 修改时长 / 删除。
 */

import { Clock, Trash2 } from "lucide-react";
import { Button, IconButton, Popover, cn } from "@tau/ui";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import { MINUTE_MS, formatDuration, formatHM, isEarlyStop } from "../model";
import { EarlyTag, PresetDot } from "./PomodoroBits";
import { presetDotClass } from "./presetTone";

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
  usePomodoroI18n();

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
              {preset?.name ?? pomoText("fallback.deletedPreset")}
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
              <dt className="text-ink-2">{pomoText("ui.time")}</dt>
              <dd className="text-ink-1 text-right">
                {pomoFormat.day(session.startTime, now)} {formatHM(session.startTime)}–
                {formatHM(end)}
              </dd>
              <dt className="text-ink-2">{pomoText("ui.focus2")}</dt>
              <dd className="text-ink-1 text-right font-medium">
                {pomoFormat.durationDetail(session.focusMs)}
                {session.expectedMs
                  ? pomoText("duration.expectedSuffix", {
                      minutes: pomoValue(Math.round(session.expectedMs / MINUTE_MS)),
                    })
                  : ""}
              </dd>
              {session.boundTitle && (
                <>
                  <dt className="text-ink-2">{pomoText("ui.linkedTo")}</dt>
                  <dd className="min-w-0 text-right">
                    <button
                      type="button"
                      title={pomoText("action.openNamed", { name: pomoValue(session.boundTitle) })}
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
              <dt className="text-ink-2">{pomoText("ui.pause")}</dt>
              <dd className="text-ink-1 text-right">
                {session.pauseCount
                  ? pomoText("summary.pausesDuration", {
                      count: pomoValue(session.pauseCount),
                      duration: pomoValue(formatDuration(session.pauseTotalMs)),
                    })
                  : pomoText("ui.none")}
              </dd>
            </dl>
          </Popover.Body>
          <Popover.Footer className="justify-between">
            <IconButton
              aria-label={pomoText("ui.deleteRecord")}
              title={pomoText("ui.deleteRecord")}
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
              {pomoText("ui.editDuration")}
            </Button>
          </Popover.Footer>
        </>
      )}
    </Popover>
  );
}
