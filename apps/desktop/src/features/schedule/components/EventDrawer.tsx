/**
 * 日程详情抽屉（非模态 Drawer，纸内右侧整高，不压暗日历）：点任一视图里的日程打开，
 * 头部 = 标题 · 日期时间 · 日历 + 「开始专注」（定时、非番茄日程），正文即可编辑的表单（useEventForm），底栏删除 / 保存。
 * 与当日时间线抽屉同位：打开时暂代它，关掉回到时间线。Esc 经页面浮层仲裁关闭。
 *
 * 未保存修改守卫：所有关闭 / 换条请求（×、关闭、Esc、点别的日程）都经 peekStore，抽屉只在
 * 表单干净时跟随；有未保存修改则先确认「放弃修改」，选「继续编辑」把 store 拨回当前这条。
 */

import { scheduleText, scheduleFormat, useScheduleI18n } from "../i18n";
import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/types";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Drawer, cn, toast, useRetainedValue } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useCalendarCatalog } from "../queries";
import { TONE, eventToneStyle } from "../eventTone";
import { usePeekStore } from "../peekStore";
import { eventTimeLabel } from "./AgendaRow";
import { useEventForm } from "./EventDialog/useEventForm";
import { FocusStartButton } from "@/features/pomodoro/components/FocusStartButton";
import { EventTitle, useEventDecor } from "./EventTitle";

export function EventDrawer({ className }: { className?: string }) {
  useScheduleI18n();

  const requested = usePeekStore(s => s.event);
  const close = usePeekStore(s => s.close);
  const { calendars } = useCalendarCatalog();
  /** 抽屉实际展示的日程（requested 经未保存守卫后才落到这里） */
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  /** 等待确认的请求：放弃修改后切到 next（null = 关闭） */
  const [pending, setPending] = useState<{ next: CalendarEvent | null } | null>(null);
  /** ConfirmDialog 确认后仍会回调 onOpenChange(false)：用它区分「放弃」与「继续编辑」 */
  const discarded = useRef(false);
  useOverlayDismiss(close, selected !== null && pending === null);
  /* 关闭时保留最后一条做退场动画 */
  const event = useRetainedValue(selected);
  const decorOf = useEventDecor(event ? [event] : []);
  const form = useEventForm(event, () => {
    close();
    toast.success(scheduleText("feedback.saved"));
  });

  useEffect(() => {
    if (requested === selected) return;
    if (form.dirty) setPending({ next: requested });
    else setSelected(requested);
    // 只响应外部请求；form.dirty 取本次渲染的值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const calendar = event ? calendars.find(c => c.id === event.calendarId) : undefined;

  return (
    <>
      <Drawer
        modal={false}
        open={selected !== null}
        onOpenChange={open => !open && close()}
        label={scheduleText("event.details")}
        width={440}
        className={className}
        icon={
          event && (
            <i
              style={eventToneStyle(event, calendars)}
              className={cn("mt-[7px] block size-2.5 rounded-[3px] bg-[var(--cal)]", TONE)}
            />
          )
        }
        title={
          event && (
            <EventTitle
              event={event}
              decor={decorOf(event)}
              className="min-w-0 flex-1 truncate font-semibold"
            />
          )
        }
        actions={
          event &&
          !event.allDay &&
          decorOf(event).kind !== "pomodoro" && (
            <FocusStartButton target={{ kind: "event", eventId: event.id }} title={event.title} />
          )
        }
        subtitle={
          event && (
            <span className="font-tau-mono block truncate tabular-nums">
              {scheduleFormat.dateRange(event.startDate, event.endDate)} · {eventTimeLabel(event)}
              {calendar && <span className="font-sans"> · {calendar.title}</span>}
            </span>
          )
        }
        footer={
          <>
            {form.dirty && (
              <span className="text-warn text-tau-sm mr-auto">{scheduleText("event.unsaved")}</span>
            )}
            {!form.isSystemCalendarEvent && !form.dirty && (
              <Button
                variant="danger-soft"
                size="sm"
                icon={Trash2}
                disabled={form.saving}
                onClick={form.remove}
              >
                {scheduleText("action.delete")}
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="secondary" size="sm" disabled={form.saving} onClick={close}>
              {scheduleText("action.close")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={form.saving}
              disabled={!form.canSave}
              onClick={form.save}
            >
              {scheduleText("action.save")}
            </Button>
          </>
        }
      >
        {form.fields}
      </Drawer>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={open => {
          if (open) return;
          if (!discarded.current) usePeekStore.setState({ event: selected }); // 继续编辑：拨回当前这条
          discarded.current = false;
          setPending(null);
        }}
        danger
        title={scheduleText("discard.title")}
        context={event?.title}
        description={
          pending?.next
            ? scheduleText("discard.switchDescription")
            : scheduleText("discard.closeDescription")
        }
        cancelText={scheduleText("action.keepEditing")}
        confirmText={scheduleText("action.discard")}
        onConfirm={() => {
          discarded.current = true;
          // 关闭时 event 仍保留同一条（退场动画），表单不会自动重载：显式丢弃修改
          form.reset();
          setSelected(pending?.next ?? null);
        }}
      />
    </>
  );
}
