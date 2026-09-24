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
      toast.success(`已改为 ${minutes} 分钟`);
      onClose();
    } catch {
      toast.error("修改失败");
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
        修改专注时长
      </Popover.Header>
      <Popover.Body>
        <form
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-1.5">
            <IconButton aria-label="减少 1 分钟" className="size-7" onClick={() => step(-1)}>
              <Minus className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
            <NumberInput
              data-autofocus
              size="sm"
              wrapperClassName="w-[72px] flex-none"
              className="text-center tabular-nums"
              value={minutes}
              onValueChange={value => setMinutes(value ?? 0)}
              aria-label="专注时长（分钟）"
              aria-invalid={!valid || undefined}
            />
            <IconButton aria-label="增加 1 分钟" className="size-7" onClick={() => step(1)}>
              <Plus className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
            <span className="text-ink-2 text-tau-meta ml-0.5 flex-none whitespace-nowrap">
              分钟
            </span>
          </div>
          {session && (
            <p className="text-ink-2 text-tau-meta mt-2.5">
              {formatHM(session.startTime)} 开始 ·
              结束时间随专注时长调整，日程里的对应事件同步更新。
            </p>
          )}
          <button type="submit" hidden />
        </form>
      </Popover.Body>
      <Popover.Footer>
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!valid}
          onClick={() => void submit()}
        >
          保存
        </Button>
      </Popover.Footer>
    </Popover>
  );
}
