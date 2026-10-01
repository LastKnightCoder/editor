/**
 * 日程详情抽屉（非模态 Drawer，纸内右侧整高，不压暗日历）：点任一视图里的日程打开，
 * 头部 = 标题 · 日期时间 · 日历，正文即可编辑的表单（useEventForm），底栏删除 / 保存。
 * 与当日时间线抽屉同位：打开时暂代它，关掉回到时间线。Esc 经页面浮层仲裁关闭。
 *
 * 未保存修改守卫：所有关闭 / 换条请求（×、关闭、Esc、点别的日程）都经 peekStore，抽屉只在
 * 表单干净时跟随；有未保存修改则先确认「放弃修改」，选「继续编辑」把 store 拨回当前这条。
 */

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

export function EventDrawer() {
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useEventForm(event, () => {
    close();
    toast.success("日程已保存");
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
        label="日程详情"
        width={440}
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
        subtitle={
          event && (
            <span className="font-tau-mono block truncate tabular-nums">
              {dateLabel(event.startDate, event.endDate)} · {eventTimeLabel(event)}
              {calendar && <span className="font-sans"> · {calendar.title}</span>}
            </span>
          )
        }
        footer={
          <>
            {form.dirty && <span className="text-warn text-tau-sm mr-auto">有未保存的修改</span>}
            {!form.isSystemCalendarEvent && !form.dirty && (
              <Button
                variant="danger-soft"
                size="sm"
                icon={Trash2}
                disabled={form.saving}
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="secondary" size="sm" disabled={form.saving} onClick={close}>
              关闭
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={form.saving}
              disabled={!form.canSave}
              onClick={form.save}
            >
              保存
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
        title="放弃未保存的修改？"
        context={event?.title}
        description={
          pending?.next ? "切换到另一条日程，这里的修改将丢失。" : "关闭后这里的修改将丢失。"
        }
        cancelText="继续编辑"
        confirmText="放弃修改"
        onConfirm={() => {
          discarded.current = true;
          // 关闭时 event 仍保留同一条（退场动画），表单不会自动重载：显式丢弃修改
          form.reset();
          setSelected(pending?.next ?? null);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="删除日程"
        context={event?.title}
        description="删除后不可恢复。"
        confirmText="删除"
        onConfirm={async () => {
          await form.remove();
          setConfirmDelete(false);
        }}
      />
    </>
  );
}
