/**
 * 日程编辑弹窗（legacy EventDialog 换 tau Dialog 皮，表单逻辑保留）。
 *
 * 时间：起止各一个 DatePicker——定时日程 precision="minute"（"YYYY-MM-DD HH:mm"），
 * 全天 precision="day"；表单内部仍按 日期字符串 + "HH:mm" 分存，保存时换算回
 * 时间戳 + 分钟数（数据契约不变）。
 * 系统日历日程（番茄钟 / 待办同步）锁定日历、全天、时间、颜色，不可删除；
 * 待办日程另锁标题（反向同步未接，避免日历与待办不一致）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import type { Descendant } from "slate";
import { Editor, type EditorRef } from "@tau/editor/src";
import { AlarmClock, CalendarDays, Hash, NotebookText, Palette, Sun, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  DatePicker,
  Dialog,
  Input,
  NumberInput,
  Select,
  Switch,
  cn,
  toast,
  type SelectOption,
} from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { PROJECT_COLORS, type ProjectColorName } from "@/constants/project-colors";
import { createContent, getContentById, updateContent } from "@/commands/content";
import type { CreateCalendarEvent, UpdateCalendarEvent } from "@/types";
import { TONE, toneStyle } from "../../eventTone";
import { useCalendarKinds } from "../../queries";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const toHHmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const EventDialog = () => {
  const editingEvent = useCalendarStore(s => s.editingEvent);
  const calendars = useCalendarStore(s => s.calendars);
  const { setEditingEvent, createEvent, updateEvent, deleteEvent } = useCalendarStore.getState();
  const kinds = useCalendarKinds();

  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState<ProjectColorName | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [description, setDescription] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<EditorRef>(null);

  const open = editingEvent !== null;
  const isNew = !editingEvent || editingEvent.id === 0;
  const eventCalendar = editingEvent
    ? calendars.find(c => c.id === editingEvent.calendarId)
    : undefined;
  const isSystemCalendarEvent = eventCalendar?.isInSystemGroup ?? false;
  const isTodoEvent = editingEvent ? kinds.get(editingEvent.calendarId) === "todo" : false;

  useEffect(() => {
    if (!editingEvent) return;
    let cancelled = false;
    setTitle(editingEvent.title);
    setCalendarId(editingEvent.calendarId);
    setStartDate(dayjs(editingEvent.startDate).format("YYYY-MM-DD"));
    setEndDate(editingEvent.endDate ? dayjs(editingEvent.endDate).format("YYYY-MM-DD") : "");
    setAllDay(editingEvent.allDay);
    setColor(editingEvent.color);
    setValue(editingEvent.value ?? null);
    setStartTime(editingEvent.startTime !== null ? toHHmm(editingEvent.startTime) : "09:00");
    setEndTime(editingEvent.endTime !== null ? toHHmm(editingEvent.endTime) : "10:00");

    const apply = (content: Descendant[]) => {
      if (cancelled) return;
      setDescription(content);
      editorRef.current?.setEditorValue(content);
    };
    // 优先用预加载内容，缺失时按 id 拉取
    if (editingEvent.detailContent) {
      apply(editingEvent.detailContent);
    } else if (editingEvent.detailContentId) {
      getContentById(editingEvent.detailContentId)
        .then(content => apply(content?.content ?? DEFAULT_CONTENT))
        .catch(error => {
          console.error("Failed to load description:", error);
          apply(DEFAULT_CONTENT);
        });
    } else {
      apply(DEFAULT_CONTENT);
    }
    return () => {
      cancelled = true;
    };
  }, [editingEvent]);

  const calendarOptions = useMemo<SelectOption<number>[]>(
    () =>
      calendars
        .filter(c => (!c.isInSystemGroup && !c.archived) || c.id === calendarId)
        .map(c => ({
          value: c.id,
          searchText: c.title,
          label: (
            <span className="flex items-center gap-2">
              <span
                className={cn("size-2 shrink-0 rounded-[3px] bg-[var(--cal)]", TONE)}
                style={toneStyle(c.color)}
              />
              {c.title}
            </span>
          ),
        })),
    [calendars, calendarId]
  );

  const close = () => setEditingEvent(null);

  const handleSave = async () => {
    if (!title.trim() || !calendarId || !startDate) return;

    const startDateTs = dayjs(startDate).startOf("day").valueOf();
    const endDateTs = endDate ? dayjs(endDate).startOf("day").valueOf() : null;
    const startTimeMinutes = allDay ? null : toMinutes(startTime);
    const endTimeMinutes = allDay ? null : toMinutes(endTime);

    const endKey = (endDateTs ?? startDateTs) * 1 + (endTimeMinutes ?? 0) * 60000;
    const startKey = startDateTs + (startTimeMinutes ?? 0) * 60000;
    if (endKey < startKey) {
      toast.warning("结束时间不能早于开始时间");
      return;
    }

    setSaving(true);
    try {
      const hasContent = JSON.stringify(description) !== JSON.stringify(DEFAULT_CONTENT);
      let detailContentId = editingEvent?.detailContentId || 0;
      if (hasContent) {
        if (detailContentId) {
          await updateContent(detailContentId, description);
        } else {
          const contentId = await createContent(description, 0);
          if (contentId) detailContentId = contentId;
        }
      }

      const fields = {
        title: title.trim(),
        calendarId,
        detailContentId,
        startDate: startDateTs,
        endDate: endDateTs,
        startTime: startTimeMinutes,
        endTime: endTimeMinutes,
        allDay,
        color,
        value: value ?? undefined,
      };
      if (editingEvent && editingEvent.id !== 0) {
        await updateEvent({ ...editingEvent, ...fields } satisfies UpdateCalendarEvent);
      } else {
        await createEvent(fields satisfies CreateCalendarEvent);
      }
      close();
    } catch (error) {
      console.error("Failed to save event:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const startValue = startDate ? (allDay ? startDate : `${startDate} ${startTime}`) : null;
  const endValue = endDate ? (allDay ? endDate : `${endDate} ${endTime}`) : null;
  const precision = allDay ? "day" : "minute";

  const splitPicked = (
    picked: string | null,
    setDate: (v: string) => void,
    setTime: (v: string) => void
  ) => {
    if (!picked) {
      setDate("");
      return;
    }
    const [date, time] = picked.split(" ");
    setDate(date);
    if (time) setTime(time);
  };

  const durationHint = (() => {
    if (allDay || !startDate) return null;
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    const days = endDate ? dayjs(endDate).diff(dayjs(startDate), "day") : 0;
    const total = days * 1440 + end - start;
    if (total <= 0) return null;
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return [hours && `${hours} 小时`, mins && `${mins} 分钟`].filter(Boolean).join(" ");
  })();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) close();
        }}
        title={isNew ? "新建日程" : "编辑日程"}
        context={calendars.find(c => c.id === calendarId)?.title}
        locked={saving}
        width={600}
        footer={
          <>
            {!isNew && !isSystemCalendarEvent && (
              <Button
                variant="danger-soft"
                size="sm"
                icon={Trash2}
                className="mr-auto"
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={saving} onClick={close}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!title.trim() || !calendarId}
              onClick={handleSave}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <div className="mb-2">
            <Input
              data-autofocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="日程标题"
              disabled={isTodoEvent}
            />
          </div>
          {isSystemCalendarEvent && (
            <p className="bg-warn-soft text-warn text-tau-meta rounded-tau-sm mb-2 px-3 py-1.5">
              {isTodoEvent
                ? "来自待办：标题、时间与日历归属请在待办中修改"
                : "系统日历日程：时间、日历归属与颜色不可修改"}
            </p>
          )}

          <FieldRow icon={AlarmClock} label="时间">
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                size="sm"
                precision={precision}
                value={startValue}
                disabled={isSystemCalendarEvent}
                onValueChange={v => splitPicked(v, setStartDate, setStartTime)}
                placeholder="开始"
              />
              <span className="text-ink-3">→</span>
              <DatePicker
                size="sm"
                precision={precision}
                value={endValue}
                clearable
                disabled={isSystemCalendarEvent}
                onValueChange={v => splitPicked(v, setEndDate, setEndTime)}
                placeholder="结束（可选）"
              />
              {durationHint && <span className="text-ink-3 text-tau-meta">{durationHint}</span>}
            </div>
          </FieldRow>

          <FieldRow icon={Sun} label="全天">
            <Switch
              size="sm"
              checked={allDay}
              disabled={isSystemCalendarEvent}
              onCheckedChange={setAllDay}
              aria-label="全天"
            />
          </FieldRow>

          <FieldRow icon={CalendarDays} label="日历">
            <Select
              size="sm"
              className="w-[220px]"
              options={calendarOptions}
              value={calendarId || null}
              onValueChange={setCalendarId}
              disabled={isSystemCalendarEvent}
              searchable={calendarOptions.length > 8}
              placeholder="选择日历"
            />
          </FieldRow>

          <FieldRow icon={Palette} label="颜色">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                title="跟随日历"
                aria-pressed={color === null}
                disabled={isSystemCalendarEvent}
                onClick={() => setColor(null)}
                className={cn(
                  "text-ink-3 border-line-1 h-[20px] rounded-[6px] border px-1.5 text-[11px]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  color === null && "border-accent text-accent-text"
                )}
              >
                跟随日历
              </button>
              {PROJECT_COLORS.map(c => (
                <button
                  key={c.name}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={color === c.name}
                  disabled={isSystemCalendarEvent}
                  onClick={() => setColor(c.name)}
                  style={toneStyle(c.name)}
                  className={cn(
                    "size-[18px] rounded-[6px] bg-[var(--cal)] transition-shadow",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    TONE,
                    color === c.name &&
                      "shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_3.5px_var(--cal)]"
                  )}
                />
              ))}
            </div>
          </FieldRow>

          <FieldRow icon={Hash} label="数值">
            <NumberInput
              size="sm"
              className="w-[220px]"
              value={value}
              onValueChange={setValue}
              placeholder="可选，如时间成本、金额"
            />
          </FieldRow>

          <FieldRow icon={NotebookText} label="备注" alignTop>
            <div
              className={cn(
                "border-line-1 bg-surface rounded-tau-md min-h-[140px] border px-3 py-2",
                "focus-within:border-accent transition-shadow focus-within:shadow-[var(--tau-focus-ring)]"
              )}
            >
              <Editor
                ref={editorRef}
                initValue={description}
                onChange={setDescription}
                readonly={false}
                placeHolder="添加备注…"
              />
            </div>
          </FieldRow>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="删除日程"
        context={editingEvent?.title}
        description="删除后不可恢复。"
        confirmText="删除"
        onConfirm={async () => {
          if (!editingEvent || editingEvent.id === 0) return;
          await deleteEvent(editingEvent.id);
          setConfirmDelete(false);
          close();
        }}
      />
    </>
  );
};

function FieldRow({
  icon: Icon,
  label,
  alignTop,
  children,
}: {
  icon: typeof AlarmClock;
  label: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[72px_1fr] gap-2 py-1.5",
        alignTop ? "items-start" : "items-center"
      )}
    >
      <span
        className={cn("text-ink-2 text-tau-meta flex items-center gap-1.5", alignTop && "pt-2")}
      >
        <Icon className="text-ink-3 size-[15px]" strokeWidth={1.75} />
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default EventDialog;
