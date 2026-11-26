import { pomoText, pomoValue, usePomodoroI18n } from "../i18n";
/**
 * 修改专注时长（Popover，锚定记录行的时长按钮 / 账本色块）。
 * 接口只能改 focusMs：主进程随之重算结束时间与暂停段并重建日历事件，所以不提供撤销。
 */

import { useEffect, useState } from "react";
import { Clock, Minus, Plus } from "lucide-react";
import { Button, IconButton, NumberInput, Popover, toast } from "@tau/ui";
import type { PomodoroSession } from "@/types";
import { MINUTE_MS, formatHM } from "../model";

const MAX_MINUTES = 600;

export function FocusEditorPopover({
  session,
  anchor,
  onClose,
  onSubmit,
}: {
  session: PomodoroSession | null;
  anchor: HTMLElement | null;
  onClose: () => void;
  onSubmit: (session: PomodoroSession, focusMs: number) => Promise<unknown>;
}) {
  usePomodoroI18n();

  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (session) setMinutes(Math.max(1, Math.round(session.focusMs / MINUTE_MS)));
  }, [session]);

  const valid = minutes >= 1 && minutes <= MAX_MINUTES;
  const submit = async () => {
    if (!session || !valid || saving) return;
    setSaving(true);
    try {
      await onSubmit(session, minutes * MINUTE_MS);
      toast.success(pomoText("feedback.durationChanged", { minutes: pomoValue(minutes) }));
      onClose();
    } catch {
      toast.error(pomoText("ui.couldNotUpdate"));
    } finally {
      setSaving(false);
    }
  };
  const step = (delta: number) => setMinutes(m => Math.min(MAX_MINUTES, Math.max(1, m + delta)));

  return (
    <Popover
      anchor={anchor}
      open={session !== null && anchor !== null}
      onOpenChange={open => !open && onClose()}
      placement="bottom-end"
      arrow={false}
      className="w-[288px]"
    >
      <Popover.Header icon={<Clock className="size-[15px]" strokeWidth={1.75} />}>
        {pomoText("ui.editFocusDuration")}
      </Popover.Header>
      <Popover.Body>
        <form
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-1.5">
            <IconButton
              aria-label={pomoText("ui.subtractOneMinute")}
              className="size-7"
              onClick={() => step(-1)}
            >
              <Minus className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
            <NumberInput
              data-autofocus
              size="sm"
              wrapperClassName="w-[72px] flex-none"
              className="text-center tabular-nums"
              value={minutes}
              onValueChange={value => setMinutes(value ?? 0)}
              aria-label={pomoText("ui.focusDurationMinutes")}
              aria-invalid={!valid || undefined}
            />
            <IconButton
              aria-label={pomoText("ui.addOneMinute")}
              className="size-7"
              onClick={() => step(1)}
            >
              <Plus className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
            <span className="text-ink-2 text-tau-meta ml-0.5 flex-none whitespace-nowrap">
              {pomoText("unit.minutes")}
            </span>
          </div>
          {session && (
            <p className="text-ink-2 text-tau-meta mt-2.5">
              {formatHM(session.startTime)}{" "}
              {pomoText("ui.startAndEndTimesAdjustWithFocusDurationAnd")}
            </p>
          )}
          <button type="submit" hidden />
        </form>
      </Popover.Body>
      <Popover.Footer>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {pomoText("ui.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!valid}
          onClick={() => void submit()}
        >
          {pomoText("ui.save")}
        </Button>
      </Popover.Footer>
    </Popover>
  );
}
