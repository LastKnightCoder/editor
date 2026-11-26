// 日程详情页（全屏页面式）：日历归属行 + 大标题 + 信息卡（时间/日历/数值）
// + 富文本详情卡（真实 Editor 只读）+ 底部操作条；系统日程只读并提供来源模块入口。

import { useCalendarI18n } from "./i18n";
import { useMemo, useRef, useState } from "react";
import { useMobileContentKit } from "../../services/editorKit";
import type { Descendant } from "slate";
import { Editor, createValueDocument } from "@tau/editor";
import { useThemeStore } from "@tau/themes/react";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { ActionSheet } from "../../components/ActionSheet";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import {
  CalendarDays,
  CalendarX2,
  ChevronRight,
  Clock,
  History,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { isEditorContentEmpty } from "../cards/editorContentUtils";
import { useEdgeFade } from "../../hooks/useScrollState";
import { eventColorValue } from "./constants";
import { useCalendarEventById, useCalendars } from "./queries";
import type { CalendarEvent } from "./types";
import { dayStart } from "./utils";
import { durationLabel, formatDateTimeLine } from "./format";

type CalendarEventDetailPageProps = {
  eventId: number;
  onBack: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: number) => void;
  onOpenPomodoroHistory: (day: number) => void;
  onOpenTodo: () => void;
};

export function CalendarEventDetailPage({
  eventId,
  onBack,
  onEdit,
  onDelete,
  onOpenPomodoroHistory,
  onOpenTodo,
}: CalendarEventDetailPageProps) {
  const { t: translate, locale } = useCalendarI18n();
  const contentKit = useMobileContentKit("read");
  const isDark = useThemeStore(s => s.mode === "dark");
  const { data: event, isError } = useCalendarEventById(eventId);
  const { data: calendars = [] } = useCalendars();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const document = useMemo(
    () => createValueDocument((event?.detailContent ?? []) as Descendant[]),
    [event?.detailContent]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);

  // 事件行展示色：事件覆盖色 > 日历色 > 兜底（详情数据缺日历字段时再查一次日历表）
  const calendar = useMemo(
    () => calendars.find(item => item.id === event?.calendarId),
    [calendars, event?.calendarId]
  );
  const color = event
    ? eventColorValue(event.color, event.calendarColor ?? calendar?.color, isDark)
    : "var(--tau-ink-3)";
  const calendarTitle = event?.calendarTitle ?? calendar?.title ?? "";

  // 删除或同步替换后，旧事件查询失败需要明确出口。
  if (!event) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title={translate("event.detail")} onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8">
          {isError ? (
            <>
              <CalendarX2 size={34} className="text-ink-3" aria-hidden />
              <div className="text-ink-1 text-[14px] font-extrabold">
                {translate("event.missing")}
              </div>
              <div className="text-ink-3 text-center text-[12px] leading-[1.6]">
                {translate("event.reopen")}
              </div>
            </>
          ) : (
            <div className="text-ink-3 text-[13px] font-semibold">
              {translate("common.loading")}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isPomodoroEvent = event.isInSystemEvent && calendarTitle === "番茄钟";
  const isTodoEvent = event.isInSystemEvent && ["截止任务", "周期任务"].includes(calendarTitle);
  const calendarDisplayTitle = isPomodoroEvent
    ? translate("source.pomodoro")
    : isTodoEvent
      ? translate(calendarTitle === "截止任务" ? "source.todoDeadline" : "source.todoRecurring")
      : calendarTitle;
  const hasDetail = !isEditorContentEmpty(event.detailContent);
  const crossDay = event.endDate !== null && event.endDate !== event.startDate;
  const timeMain = crossDay
    ? `${formatDateTimeLine(event.startDate, event.startTime, event.allDay, { locale, t: translate })} – ${formatDateTimeLine(
        event.endDate as number,
        event.endTime,
        event.allDay,
        { locale, t: translate }
      )}`
    : formatDateTimeLine(event.startDate, event.startTime, event.allDay, { locale, t: translate });
  // 跨天定时事件的时刻只对首日有效，按时长差计算会得到「0 分钟」这类错乱值
  const durationSub = crossDay
    ? translate("event.crossDays", {
        count:
          Math.round((dayStart(event.endDate as number) - dayStart(event.startDate)) / 86_400_000) +
          1,
        amount: (
          Math.round((dayStart(event.endDate as number) - dayStart(event.startDate)) / 86_400_000) +
          1
        ).toLocaleString(locale),
      })
    : !event.allDay && event.startTime !== null && event.endTime !== null
      ? translate("event.duration", {
          duration: durationLabel(event.startTime, event.endTime, { locale, t: translate }),
        })
      : event.allDay
        ? translate("event.allDay")
        : null;

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title={translate("event.detail")}
        onBack={onBack}
        actions={
          event.isInSystemEvent ? undefined : (
            <PageHeaderButton
              icon={<MoreHorizontal size={22} strokeWidth={2.4} />}
              aria-label={translate("event.actions")}
              onClick={() => setMenuOpen(true)}
            />
          )
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="px-5 pt-1.5">
            <div className="text-ink-2 flex items-center gap-2 text-[12.5px] font-bold">
              <i className="h-[9px] w-[9px] rounded-full" style={{ background: color }} />
              {calendarDisplayTitle}
              {event.isInSystemEvent ? (
                <span className="bg-page text-ink-3 ml-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold">
                  {translate("event.system")}
                </span>
              ) : null}
            </div>
            <h2 className="text-ink-1 mt-2.5 text-[23px] leading-[1.35] font-extrabold">
              {event.title}
            </h2>
          </div>

          <div className="bg-surface shadow-card mx-[18px] mt-3 rounded-[20px] px-[18px] py-1">
            <div className="flex items-center gap-[13px] border-b border-[var(--tau-line-2)] py-3.5">
              <span className="bg-page text-ink-2 grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px]">
                <Clock size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="text-ink-1 block text-[13.5px] font-bold">{timeMain}</span>
                {durationSub ? (
                  <span className="text-ink-3 mt-0.5 block text-[11.5px] font-semibold">
                    {durationSub}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex items-center gap-[13px] border-b border-[var(--tau-line-2)] py-3.5 last:border-b-0">
              <span className="bg-page text-ink-2 grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px]">
                <CalendarDays size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="text-ink-1 block text-[13.5px] font-bold">
                  {calendarDisplayTitle}
                </span>
              </span>
            </div>
          </div>

          {isPomodoroEvent || isTodoEvent ? (
            <div className="px-[22px] pt-3">
              <button
                type="button"
                onClick={
                  isPomodoroEvent ? () => onOpenPomodoroHistory(event.startDate) : onOpenTodo
                }
                className="text-accent bg-accent-soft flex w-full items-center gap-2.5 rounded-2xl px-4 py-3.5 text-[13.5px] font-extrabold"
              >
                {isPomodoroEvent ? (
                  <History size={17} strokeWidth={2.3} />
                ) : (
                  <ListTodo size={17} strokeWidth={2.3} />
                )}
                {isPomodoroEvent ? translate("event.openPomodoro") : translate("event.openTodo")}
                <ChevronRight size={16} strokeWidth={2.6} className="ml-auto opacity-70" />
              </button>
              <p className="text-ink-3 pt-3 text-[11.5px] leading-[1.7]">
                {translate(isPomodoroEvent ? "source.pomodoroHint" : "source.todoHint")}
              </p>
            </div>
          ) : null}

          {hasDetail || !event.isInSystemEvent ? (
            <>
              <div className="text-ink-3 px-[22px] pt-4 pb-2 text-[12px] font-extrabold tracking-[1px]">
                {translate("event.description")}
              </div>
              <div className="px-[18px] pb-8">
                <div className="bg-surface shadow-card rounded-[20px] px-5 py-[18px]">
                  {hasDetail ? (
                    <Editor
                      kit={contentKit}
                      document={document}
                      readonly={true}
                      className="text-ink-1 w-full text-[13.5px] leading-[1.85] font-medium outline-none"
                    />
                  ) : (
                    <p className="text-ink-3 text-[13.5px] leading-[1.85]">
                      {translate("event.noDescription")}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {!event.isInSystemEvent ? (
          <div
            className="flex flex-none gap-2.5 px-[18px] pt-3.5"
            style={{ background: "linear-gradient(to top, var(--tau-bg-page) 62%, transparent)" }}
          >
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="bg-surface shadow-card text-ink-1 h-12 flex-1 rounded-2xl text-[14.5px] font-extrabold"
            >
              {translate("common.delete")}
            </button>
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="shadow-lift text-ink-inverse h-12 flex-1 rounded-2xl text-[14.5px] font-extrabold"
              style={{ background: "var(--tau-accent)" }}
            >
              {translate("common.edit")}
            </button>
          </div>
        ) : null}
      </div>

      <ActionSheet
        open={menuOpen}
        title={translate("event.actions")}
        items={[
          {
            label: translate("event.edit"),
            icon: <Pencil size={16} />,
            onClick: () => {
              setMenuOpen(false);
              onEdit(event);
            },
          },
          {
            label: translate("event.delete"),
            icon: <Trash2 size={16} />,
            danger: true,
            onClick: () => {
              setMenuOpen(false);
              setConfirmDelete(true);
            },
          },
        ]}
        onClose={() => setMenuOpen(false)}
      />

      <MobileConfirmDialog
        open={confirmDelete}
        title={translate("event.confirmDelete")}
        description={translate("common.irreversible")}
        cancelText={translate("common.cancel")}
        confirmText={translate("common.delete")}
        danger={true}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(event.id);
        }}
      />
    </div>
  );
}
