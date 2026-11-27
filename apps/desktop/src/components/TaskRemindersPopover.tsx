import { useMemo, useState, type ReactElement } from "react";
import dayjs from "dayjs";
import { Bell, Calendar, Check, ChevronLeft, Clock, Plus, X } from "lucide-react";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import {
  Button,
  DatePickerPanel,
  Popover,
  TimeField,
  cn,
  toast,
  type DatePickerPreset,
} from "@tau/ui";
import {
  CLOCK_REMINDER_PRESETS,
  clockOffsetToHm,
  formatAbsoluteReminder,
  formatClockOffset,
  hmToClockOffset,
  normalizeClockOffsets,
  normalizeDocumentReminders,
  reminderMessages,
} from "@tau/shared/reminders";
import type { TaskReminder } from "@tau/shared/task-assistant";
import { dayWord, nextWeekdayLabel } from "@/utils/date-format";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseHmString(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})[:：](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  )
    return null;
  return { hour, minute };
}

function defaultAddClock(existing: readonly number[]): string {
  for (const preset of CLOCK_REMINDER_PRESETS) {
    if (!existing.includes(preset)) {
      const { hour, minute } = clockOffsetToHm(preset);
      return `${pad2(hour)}:${pad2(minute)}`;
    }
  }
  return "09:00";
}

function defaultAddDateTime(dueAt?: number | null): string {
  if (dueAt != null && Number.isFinite(dueAt)) {
    const base = dayjs(dueAt);
    const hasTime = base.hour() !== 0 || base.minute() !== 0;
    return (hasTime ? base : base.hour(9).minute(0)).format("YYYY-MM-DD HH:mm");
  }
  const now = dayjs();
  const nextHour = now.minute() >= 30 ? now.add(2, "hour").minute(0) : now.add(1, "hour").minute(0);
  if (nextHour.isSame(now, "day")) return nextHour.format("YYYY-MM-DD HH:mm");
  return now.add(1, "day").hour(9).minute(0).format("YYYY-MM-DD HH:mm");
}

export interface ClockRemindersPanelProps {
  value: readonly number[];
  onChange: (offsets: number[]) => void | Promise<void>;
  disabled?: boolean;
}

/** 重复独立待办与重复正文勾选项的当天钟点多提醒面板（纸白层次，无提前量预设） */
export function ClockRemindersPanel({
  value,
  onChange,
  disabled = false,
}: ClockRemindersPanelProps) {
  const { t, locale } = useI18n(reminderMessages, desktopI18n);
  const sorted = useMemo(() => normalizeClockOffsets(value), [value]);
  const [addTime, setAddTime] = useState(() => defaultAddClock(sorted));
  const [editingOffset, setEditingOffset] = useState<number | null>(null);
  const [editTime, setEditTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  const commit = async (next: number[]) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onChange(normalizeClockOffsets(next));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (time: string) => {
    const parsed = parseHmString(time);
    if (!parsed) {
      toast.info(t("ui.invalidTime"));
      return;
    }
    const offset = hmToClockOffset(parsed.hour, parsed.minute);
    const next = normalizeClockOffsets([...sorted, offset]);
    void commit(next);
    setAddTime(defaultAddClock(next));
  };

  const handleTogglePreset = (offset: number) => {
    const exists = sorted.includes(offset);
    const next = exists ? sorted.filter(item => item !== offset) : [...sorted, offset];
    void commit(next);
  };

  const startEdit = (offset: number) => {
    if (disabled) return;
    const { hour, minute } = clockOffsetToHm(offset);
    setEditingOffset(offset);
    setEditTime(`${pad2(hour)}:${pad2(minute)}`);
  };

  const commitEdit = (time: string) => {
    if (editingOffset === null) return;
    const parsed = parseHmString(time);
    if (!parsed) {
      toast.info(t("ui.invalidTime"));
      return;
    }
    const replacement = hmToClockOffset(parsed.hour, parsed.minute);
    const next = sorted.map(item => (item === editingOffset ? replacement : item));
    setEditingOffset(null);
    void commit(next);
  };

  return (
    <div className="p-3 text-[12.5px] select-none">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-ink-1 text-[13px] font-semibold">{t("ui.title")}</span>
        {sorted.length > 0 && !disabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditingOffset(null);
              void commit([]);
            }}
            className="text-accent-text hover:bg-hover cursor-pointer rounded-[6px] px-1.5 py-0.5 text-[11.5px] outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:opacity-50"
          >
            {t("ui.clear")}
          </button>
        )}
      </div>
      <p className="text-ink-3 mb-2.5 text-[11.5px] leading-relaxed">{t("ui.seriesHint")}</p>

      <div className="mb-2.5 flex flex-col gap-0.5">
        {sorted.length === 0 ? (
          <div className="border-line-1 text-ink-3 rounded-[9px] border border-dashed py-3 text-center text-[12px]">
            {t("ui.emptyClock")}
          </div>
        ) : (
          sorted.map(offset => {
            const label = formatClockOffset(offset, locale);
            if (editingOffset === offset) {
              return (
                <div
                  key={offset}
                  className="border-accent bg-surface flex items-center gap-1.5 rounded-[8px] border px-2 py-1"
                >
                  <TimeField
                    value={editTime}
                    onValueChange={setEditTime}
                    onSubmit={commitEdit}
                    step={15}
                    nowMark={false}
                    aria-label={t("ui.editReminder")}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => commitEdit(editTime)}
                    className="h-[26px] px-2.5 text-[11.5px]"
                  >
                    {t("ui.confirm")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingOffset(null)}
                    className="text-ink-2 hover:bg-hover rounded-[6px] px-1.5 py-1 text-[11.5px]"
                  >
                    {t("ui.cancel")}
                  </button>
                </div>
              );
            }
            return (
              <div
                key={offset}
                className="hover:bg-hover group flex h-[32px] items-center gap-2 rounded-[8px] px-2 transition-colors"
              >
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => startEdit(offset)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:cursor-default"
                >
                  <Clock className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
                  <span className="text-ink-1 text-[13px] font-medium tabular-nums">{label}</span>
                  {!disabled && (
                    <span className="text-ink-3 ml-0.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
                      {t("ui.edit")}
                    </span>
                  )}
                </button>
                {!disabled && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${t("ui.delete")} ${label}`}
                    onClick={() => void commit(sorted.filter(item => item !== offset))}
                    className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
                  >
                    <X className="size-3" strokeWidth={1.85} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {!disabled && (
        <>
          <div className="border-line-2 mb-2.5 flex items-center gap-1.5 border-t pt-2.5">
            <TimeField
              value={addTime}
              onValueChange={setAddTime}
              onSubmit={handleAdd}
              step={15}
              nowMark={false}
              aria-label={t("ui.addReminder")}
            />
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              disabled={busy}
              onClick={() => handleAdd(addTime)}
              className="h-[28px] shrink-0 px-2.5 text-[12px]"
            >
              {t("ui.add")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CLOCK_REMINDER_PRESETS.map(preset => {
              const active = sorted.includes(preset);
              const label = formatClockOffset(preset, locale);
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => handleTogglePreset(preset)}
                  className={cn(
                    "ease-tau-out inline-flex h-[24px] cursor-pointer items-center gap-1 rounded-[7px] border px-2 text-[11.5px] tabular-nums outline-none transition-[background-color,border-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                    active
                      ? "bg-selected text-accent-text border-transparent font-semibold"
                      : "border-line-1 bg-surface text-ink-2 hover:bg-hover hover:text-ink-1"
                  )}
                >
                  {active && <Check className="size-[11px]" strokeWidth={2.5} />}
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export interface AbsoluteRemindersPanelProps {
  value: readonly TaskReminder[];
  onChange: (reminders: TaskReminder[]) => void | Promise<void>;
  /** 可选默认参考日期（没有截止日期时默认落到今天下一整点或明天 09:00） */
  dueAt?: number | null;
  disabled?: boolean;
}

/** 普通正文勾选项的绝对时刻多提醒面板（内嵌 @tau/ui DatePickerPanel） */
export function AbsoluteRemindersPanel({
  value,
  onChange,
  dueAt,
  disabled = false,
}: AbsoluteRemindersPanelProps) {
  const { t, locale } = useI18n(reminderMessages, desktopI18n);
  const now = Date.now();
  const sorted = useMemo(
    () => normalizeDocumentReminders(value, false) as Array<{ at: string }>,
    [value]
  );
  const [picker, setPicker] = useState<{
    mode: "add" | "edit";
    targetAt?: string;
    initialValue: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const presets = useMemo<DatePickerPreset[]>(() => {
    const base = Date.now();
    return [
      {
        label: dayWord(base, base, locale),
        value: () => dayjs().hour(9).minute(0).format("YYYY-MM-DD HH:mm"),
      },
      {
        label: dayWord(dayjs(base).add(1, "day").valueOf(), base, locale),
        value: () => dayjs().add(1, "day").hour(9).minute(0).format("YYYY-MM-DD HH:mm"),
      },
      {
        label: nextWeekdayLabel(1, locale),
        value: () =>
          dayjs()
            .add((8 - dayjs().day()) % 7 || 7, "day")
            .hour(9)
            .minute(0)
            .format("YYYY-MM-DD HH:mm"),
      },
    ];
  }, [locale]);

  const commit = async (next: TaskReminder[]) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onChange(normalizeDocumentReminders(next, false));
    } finally {
      setBusy(false);
    }
  };

  if (picker) {
    return (
      <div className="select-none">
        <div className="border-line-2 flex items-center justify-between border-b px-3 py-2">
          <button
            type="button"
            onClick={() => setPicker(null)}
            className="text-ink-2 hover:bg-hover hover:text-ink-1 -ml-1 flex cursor-pointer items-center gap-0.5 rounded-[6px] px-1.5 py-0.5 text-[12px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.85} />
            {t("ui.back")}
          </button>
          <span className="text-ink-1 text-[12.5px] font-semibold">
            {picker.mode === "add" ? t("ui.addReminder") : t("ui.editReminder")}
          </span>
          <span className="w-10" />
        </div>
        <DatePickerPanel
          key={`${picker.mode}:${picker.targetAt ?? "new"}`}
          precision="minute"
          value={picker.initialValue}
          presets={presets}
          className="w-full"
          onCommit={nextStr => {
            if (!nextStr) {
              setPicker(null);
              return;
            }
            const parsed = dayjs(nextStr, "YYYY-MM-DD HH:mm");
            if (!parsed.isValid()) return;
            const iso = parsed.second(0).millisecond(0).toISOString();
            const nextList =
              picker.mode === "add"
                ? [...sorted, { at: iso }]
                : sorted.map(item => (item.at === picker.targetAt ? { at: iso } : item));
            setPicker(null);
            void commit(nextList);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-3 text-[12.5px] select-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-ink-1 text-[13px] font-semibold">{t("ui.title")}</span>
        {sorted.length > 0 && !disabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void commit([])}
            className="text-accent-text hover:bg-hover cursor-pointer rounded-[6px] px-1.5 py-0.5 text-[11.5px] outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:opacity-50"
          >
            {t("ui.clear")}
          </button>
        )}
      </div>

      <div className="mb-2.5 flex flex-col gap-0.5">
        {sorted.length === 0 ? (
          <div className="border-line-1 text-ink-3 rounded-[9px] border border-dashed px-2 py-3.5 text-center text-[12px] leading-relaxed">
            <div>{t("ui.emptyAbsolute")}</div>
            <div className="mt-0.5 text-[11px]">{t("ui.emptyAbsoluteHint")}</div>
          </div>
        ) : (
          sorted.map(item => {
            const label = formatAbsoluteReminder(item.at, now, { locale });
            return (
              <div
                key={item.at}
                className="hover:bg-hover group flex h-[32px] items-center gap-2 rounded-[8px] px-2 transition-colors"
              >
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() =>
                    setPicker({
                      mode: "edit",
                      targetAt: item.at,
                      initialValue: dayjs(item.at).format("YYYY-MM-DD HH:mm"),
                    })
                  }
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:cursor-default"
                >
                  <Calendar className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
                  <span className="text-ink-1 truncate text-[12.5px] font-medium tabular-nums">
                    {label}
                  </span>
                  {!disabled && (
                    <span className="text-ink-3 ml-0.5 shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
                      {t("ui.edit")}
                    </span>
                  )}
                </button>
                {!disabled && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${t("ui.delete")} ${label}`}
                    onClick={() => void commit(sorted.filter(entry => entry.at !== item.at))}
                    className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
                  >
                    <X className="size-3" strokeWidth={1.85} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {!disabled && (
        <Button
          size="sm"
          variant="soft"
          icon={Plus}
          block
          disabled={busy}
          onClick={() =>
            setPicker({
              mode: "add",
              initialValue: defaultAddDateTime(dueAt),
            })
          }
        >
          {t("ui.addReminder")}
        </Button>
      )}
    </div>
  );
}

type TaskRemindersPopoverProps =
  | {
      mode: "clock";
      trigger: ReactElement;
      value: readonly number[];
      onChange: (offsets: number[]) => void | Promise<void>;
      disabled?: boolean;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
  | {
      mode: "absolute";
      trigger: ReactElement;
      value: readonly TaskReminder[];
      onChange: (reminders: TaskReminder[]) => void | Promise<void>;
      dueAt?: number | null;
      disabled?: boolean;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    };

export function TaskRemindersPopover(props: TaskRemindersPopoverProps) {
  const { trigger, open, onOpenChange, disabled } = props;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      placement="bottom-start"
      arrow={false}
      className="w-[300px]"
      trigger={trigger}
    >
      {props.mode === "clock" ? (
        <ClockRemindersPanel value={props.value} onChange={props.onChange} disabled={disabled} />
      ) : (
        <AbsoluteRemindersPanel
          value={props.value}
          onChange={props.onChange}
          dueAt={props.dueAt}
          disabled={disabled}
        />
      )}
    </Popover>
  );
}

export { Bell as ReminderBellIcon };
