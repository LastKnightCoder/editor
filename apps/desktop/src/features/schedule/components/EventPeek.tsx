/**
 * 日程速览（锚定 Popover）：标题 + 时间 + 日历 + 备注摘要；
 * 底栏「删除」（系统日历日程不显示）与「编辑」（进 EventDialog）。
 */

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Popover, cn } from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { clampText, richTextPlainText } from "@/utils/richTextText";
import { TONE, eventToneStyle } from "../eventTone";
import { usePeekStore } from "../peekStore";
import { eventTimeLabel } from "./AgendaRow";
import { EventTitle, useEventDecor } from "./EventTitle";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function dateLabel(start: number, end: number | null) {
  const fmt = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
  };
  if (!end || new Date(end).toDateString() === new Date(start).toDateString()) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function EventPeek() {
  const event = usePeekStore(s => s.event);
  const anchor = usePeekStore(s => s.anchor);
  const close = usePeekStore(s => s.close);
  const calendars = useCalendarStore(s => s.calendars);
  const decorOf = useEventDecor(event ? [event] : []);
  const [confirmDelete, setConfirmDelete] = useState<typeof event>(null);

  const calendar = event ? calendars.find(c => c.id === event.calendarId) : undefined;
  const excerpt = event?.detailContent
    ? clampText(richTextPlainText(event.detailContent), 140)
    : "";

  return (
    <>
      <Popover
        anchor={anchor}
        open={event !== null && anchor !== null}
        onOpenChange={open => {
          if (!open) close();
        }}
        placement="right-start"
        arrow={false}
        className="w-[300px]"
      >
        {event && (
          <div style={eventToneStyle(event, calendars)} className={cn("px-4 pb-3 pt-3.5", TONE)}>
            <div className="flex items-start gap-2">
              <i className="mt-[6px] size-2.5 shrink-0 rounded-[3px] bg-[var(--cal)]" />
              <EventTitle
                event={event}
                decor={decorOf(event)}
                className="text-tau-title min-w-0 flex-1 whitespace-normal font-semibold leading-[1.4]"
              />
            </div>
            <div className="text-ink-2 text-tau-meta ml-[18px] mt-1.5 flex flex-col gap-0.5">
              <span className="font-tau-mono tabular-nums">
                {dateLabel(event.startDate, event.endDate)} · {eventTimeLabel(event)}
              </span>
              {calendar && <span>{calendar.title}</span>}
              {event.value != null && <span className="font-tau-mono">数值 {event.value}</span>}
            </div>
            {excerpt && (
              <p className="text-ink-2 text-tau-meta ml-[18px] mt-2.5 line-clamp-3 leading-[1.6]">
                {excerpt}
              </p>
            )}
            <div className="mt-3 flex items-center gap-1.5">
              {!calendar?.isInSystemGroup && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  className="text-danger hover:text-danger"
                  onClick={() => setConfirmDelete(event)}
                >
                  删除
                </Button>
              )}
              <span className="flex-1" />
              <Button
                variant="secondary"
                size="sm"
                icon={Pencil}
                onClick={() => {
                  close();
                  useCalendarStore.getState().setEditingEvent(event);
                }}
              >
                编辑
              </Button>
            </div>
          </div>
        )}
      </Popover>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={open => {
          if (!open) setConfirmDelete(null);
        }}
        danger
        title="删除日程"
        context={confirmDelete?.title}
        description="删除后不可恢复。"
        confirmText="删除"
        onConfirm={async () => {
          if (!confirmDelete) return;
          await useCalendarStore.getState().deleteEvent(confirmDelete.id);
          setConfirmDelete(null);
          close();
        }}
      />
    </>
  );
}
