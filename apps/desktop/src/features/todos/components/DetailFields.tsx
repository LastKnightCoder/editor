import { todosTranslator, todosCount, useTodosI18n } from "@/features/todos/i18n";
import {
  dayWord,
  recurrenceText,
  monthDay,
  weekdayName,
  nextWeekdayLabel,
} from "@/utils/date-format";
/**
 * 抽屉详情 · 属性区：项目 / 类型 / 截止 / 重复规则 / 提醒 / 日程同步说明 / 安排与已投入专注（只读）。
 * 每项即改即存（无保存按钮）；日历同步由主进程 updateItem 内部完成。
 * 重复规则可改（legacy 创建后只读）：类型 / 间隔 / 周几 / 每月几号 / 排除节假日。
 */

import dayjs from "dayjs";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Flag,
  Folder,
  Hash,
  List,
  Repeat,
  SignalHigh,
  Timer,
  CalendarClock,
} from "lucide-react";
import { useTodoFocusSummary } from "@/features/pomodoro/queries";
import { useTodoSchedules } from "@/features/schedule/queries";
import { usePage } from "@/page/PageProvider";
import { formatTime } from "@/utils/calendar";
import type { TagCount } from "@/utils/tags";
import AddTag from "@/components/AddTag";
import {
  DatePicker,
  Menu,
  NumberInput,
  Popover,
  Segmented,
  Switch,
  cn,
  toast,
  type DatePickerPreset,
} from "@tau/ui";
import type {
  CalendarEvent,
  RecurrenceType,
  TodoGroup,
  TodoItemType,
  TodoPriority,
  TodoRecurrence,
} from "@/types";
import type { ComponentProps, ReactNode } from "react";
import {
  reminderMessages,
  summarizeClockReminders,
  summarizeReminders,
} from "@tau/shared/reminders";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { ReminderMenu } from "@/components/ReminderMenu";
import { TaskRemindersPopover } from "@/components/TaskRemindersPopover";
import { priorityOf, tagsOf, todoReminders } from "../model";
import type { TodoMutations } from "../queries";
import type { TodoEntry } from "../types";
import { GroupDot, PRIORITY_TONE, PriorityIcon } from "./TodoBits";
const t = todosTranslator.t;

const toPicker = (ts: number | null | undefined) =>
  ts == null ? null : dayjs(ts).format("YYYY-MM-DD HH:mm");
const fromPicker = (value: string | null) => (value ? dayjs(value).valueOf() : null);

function DatePresetLabel({ kind }: { kind: "today" | "tomorrow" | "monday" }) {
  const { locale } = useTodosI18n();
  const now = Date.now();
  return kind === "monday"
    ? nextWeekdayLabel(1, locale)
    : dayWord(kind === "today" ? now : dayjs(now).add(1, "day").valueOf(), now, locale);
}

const PRESETS: DatePickerPreset[] = [
  {
    label: <DatePresetLabel kind="today" />,
    value: () => dayjs().startOf("day").format("YYYY-MM-DD HH:mm"),
  },
  {
    label: <DatePresetLabel kind="tomorrow" />,
    value: () => dayjs().add(1, "day").startOf("day").format("YYYY-MM-DD HH:mm"),
  },
  {
    label: <DatePresetLabel kind="monday" />,
    value: () =>
      dayjs()
        .add((8 - dayjs().day()) % 7 || 7, "day")
        .startOf("day")
        .format("YYYY-MM-DD HH:mm"),
  },
];

const DRAWER_PRIORITIES: readonly TodoPriority[] = ["none", "low", "medium", "high"];

export function DetailFields({
  entry,
  groups,
  mutations,
  tagSuggestions = [],
}: {
  entry: TodoEntry;
  groups: TodoGroup[];
  mutations: TodoMutations;
  tagSuggestions?: TagCount[];
}) {
  const { locale } = useTodosI18n();
  const { t: tReminder } = useI18n(reminderMessages, desktopI18n);
  const group = groups.find(g => g.id === entry.groupId);
  const isChild = entry.parentId != null;
  const currentTags = tagsOf(entry);

  return (
    <div className="flex flex-col gap-0.5">
      <Field icon={Folder} label={t("doc.group")}>
        {isChild ? (
          <span className="text-ink-2 flex items-center gap-1.5 text-[12.5px]">
            <GroupDot color={group?.color} className="size-[7px]" />
            {group?.title ?? "—"}
            <span className="text-ink-3">{t("field.inheritGroup")}</span>
          </span>
        ) : (
          <Menu
            trigger={
              <FieldButton>
                <GroupDot color={group?.color} className="size-[7px]" />
                {group?.title ?? t("field.chooseGroup")}
                <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
              </FieldButton>
            }
          >
            <Menu.Group>{t("field.moveGroup")}</Menu.Group>
            <Menu.RadioGroup
              value={String(entry.groupId)}
              onValueChange={v => void mutations.moveToGroup(entry, Number(v))}
            >
              {groups.map(g => (
                <Menu.RadioItem
                  key={g.id}
                  value={String(g.id)}
                  icon={<GroupDot color={g.color} className="size-[7px]" />}
                >
                  {g.title}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu>
        )}
      </Field>

      <Field icon={SignalHigh} label={t("priority.label")}>
        <Segmented
          label={t("priority.label")}
          size="sm"
          value={priorityOf(entry)}
          onValueChange={(priority: TodoPriority) => {
            void mutations.updateItem(entry, { priority });
          }}
        >
          {DRAWER_PRIORITIES.map(level => (
            <Segmented.Item
              key={level}
              value={level}
              className="px-2.5"
              label={
                <span className="inline-flex items-center gap-1">
                  {level !== "none" && (
                    <PriorityIcon priority={level} className={PRIORITY_TONE[level].text} />
                  )}
                  {t(`priority.${level}`)}
                </span>
              }
            />
          ))}
        </Segmented>
      </Field>

      <Field icon={Hash} label={t("tags.label")} align="start">
        <AddTag
          tags={currentTags}
          addTag={tag => {
            if (!currentTags.includes(tag)) {
              void mutations.updateItem(entry, { tags: [...currentTags, tag] });
            }
          }}
          removeTag={tag => {
            void mutations.updateItem(entry, { tags: currentTags.filter(item => item !== tag) });
          }}
          editTag={(oldTag, newTag) => {
            const next = [...new Set(currentTags.map(item => (item === oldTag ? newTag : item)))];
            void mutations.updateItem(entry, { tags: next });
          }}
          loadSuggestions={async () => tagSuggestions}
          className="gap-1.5"
        />
      </Field>

      <Field icon={List} label={t("field.type")}>
        <Segmented
          label={t("field.taskType")}
          size="sm"
          value={entry.type}
          onValueChange={(type: TodoItemType) => {
            void mutations.changeType(entry, type).catch(() => toast.error(t("field.typeFailed")));
          }}
        >
          <Segmented.Item value="normal" label={t("kind.normal")} />
          <Segmented.Item value="deadline" icon={Flag} label={t("kind.deadline")} />
          <Segmented.Item value="recurring" icon={Repeat} label={t("kind.recurring")} />
        </Segmented>
      </Field>

      {entry.type === "deadline" && (
        <Field icon={Flag} label={t("kind.deadline")}>
          <DatePicker
            size="sm"
            precision="minute"
            presets={PRESETS}
            value={toPicker(entry.dueAt)}
            onValueChange={v => {
              const dueAt = fromPicker(v);
              if (dueAt != null) void mutations.updateItem(entry, { dueAt });
            }}
            className="w-[176px]"
          />
          <span className="text-ink-3 text-[11.5px]">{t("field.midnight")}</span>
        </Field>
      )}

      {entry.type === "recurring" && entry.recurrence && (
        <Field icon={Repeat} label={t("field.recurrence")}>
          <RecurrenceEditor recurrence={entry.recurrence} mutations={mutations} />
          <span className="text-ink-3 text-[11.5px]">
            {t("repeat.start", { date: monthDay(entry.recurrence.startDate, locale) })}
            {entry.recurrence.endDate
              ? t("repeat.end", { date: monthDay(entry.recurrence.endDate, locale) })
              : entry.recurrence.maxOccurrences
                ? todosCount("count.occurrences", entry.recurrence.maxOccurrences)
                : t("repeat.never")}
          </span>
        </Field>
      )}

      {entry.type === "deadline" && (
        <Field icon={Bell} label={t("field.reminder")}>
          <ReminderMenu
            value={todoReminders(entry)}
            onChange={offsets => void mutations.setReminders(entry, offsets, todoReminders(entry))}
            trigger={
              <FieldButton muted={entry.remindBefore == null}>
                {summarizeReminders(todoReminders(entry), false, { locale })}
                <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
              </FieldButton>
            }
          />
        </Field>
      )}

      {entry.type === "recurring" && (
        <Field icon={Bell} label={t("field.reminder")}>
          <TaskRemindersPopover
            mode="clock"
            value={todoReminders(entry)}
            onChange={offsets => mutations.setReminders(entry, offsets, todoReminders(entry))}
            trigger={
              <FieldButton muted={entry.remindBefore == null}>
                <span className="tabular-nums">
                  {summarizeClockReminders(todoReminders(entry), { locale, t: tReminder })}
                </span>
                <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
              </FieldButton>
            }
          />
          {entry.remindBefore != null && (
            <span className="text-ink-3 text-[11.5px]">{tReminder("ui.seriesTag")}</span>
          )}
        </Field>
      )}

      {entry.type !== "normal" && (
        <Field icon={CalendarDays} label={t("field.schedule")}>
          <span className="text-ink-3 text-[12px]">
            {entry.type === "recurring"
              ? t("field.recurringCalendar")
              : t("field.deadlineCalendar")}
          </span>
        </Field>
      )}

      <ScheduleField todoId={entry.id} />
      <FocusField todoId={entry.id} />
    </div>
  );
}

/** 安排：日历里关联这条待办的事件——有未结束的显示「已安排」，否则「上次安排」；没有时不显示 */
function ScheduleField({ todoId }: { todoId: number }) {
  const { locale } = useTodosI18n();
  const { navigator } = usePage();
  const summary = useTodoSchedules([todoId])[todoId];
  const event = summary?.next ?? summary?.last;
  if (!event) return null;
  const now = Date.now();
  const more = summary.count > 1 ? todosCount("count.occurrences", summary.count) : "";
  return (
    <Field icon={CalendarClock} label={t("field.arrangements")}>
      <button
        type="button"
        title={t("field.openSchedule")}
        onClick={() => navigator.push("schedule", { eventId: event.id })}
        className={cn(
          "text-[12px] tabular-nums hover:underline",
          summary.next ? "text-ink-2" : "text-ink-3"
        )}
      >
        {summary.next ? t("field.scheduled") : t("field.lastScheduled")} ·{" "}
        {scheduleText(event, now, locale)}
        {more}
      </button>
    </Field>
  );
}

/** 「周三 9:00–11:00」「今天 14:00–15:00」「10月3日 全天」 */
function scheduleText(event: CalendarEvent, now: number, locale: string): string {
  const day = dayWord(event.startDate, now, locale);
  if (event.allDay || event.startTime == null) return t("schedule.allDay", { date: day });
  const end = event.endTime ?? event.startTime + 60;
  return t("schedule.range", {
    date: day,
    start: formatTime(event.startTime),
    end: formatTime(end),
  });
}

/** 已投入：绑定到这条待办（含其日程）的番茄；没有时不显示 */
function FocusField({ todoId }: { todoId: number }) {
  useTodosI18n();
  const summary = useTodoFocusSummary(todoId);
  if (!summary?.count) return null;
  const minutes = Math.round(summary.focusMs / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <Field icon={Timer} label={t("drawer.focus")}>
      <span className="text-ink-2 text-[12px] tabular-nums">
        {summary.count} 🍅 · {h ? `${h}h` : ""}
        {m || !h ? `${m}m` : ""}
      </span>
    </Field>
  );
}

/* ---------- 重复规则编辑（Popover） ---------- */

const REC_TYPES: { value: Exclude<RecurrenceType, "custom"> }[] = [
  { value: "daily" },
  { value: "weekdays" },
  { value: "weekly" },
  { value: "monthly" },
  { value: "yearly" },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function RecurrenceEditor({
  recurrence,
  mutations,
}: {
  recurrence: TodoRecurrence;
  mutations: TodoMutations;
}) {
  const { locale } = useTodosI18n();
  const save = (patch: Parameters<TodoMutations["updateRecurrence"]>[1]) =>
    void mutations.updateRecurrence(recurrence, patch);
  const start = new Date(recurrence.startDate);
  const weekdays = recurrence.weekdays?.length ? recurrence.weekdays : [start.getDay()];

  return (
    <Popover
      placement="bottom-start"
      arrow={false}
      className="w-[300px]"
      trigger={
        <FieldButton>
          {recurrenceText(recurrence, locale)}
          <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
        </FieldButton>
      }
    >
      <Popover.Header>{t("repeat.rule")}</Popover.Header>
      <Popover.Body>
        <div className="flex flex-col gap-3 pb-1 text-[12.5px]">
          <div className="flex items-center gap-2">
            <span className="text-ink-2 w-9 shrink-0">{t("repeat.every")}</span>
            {recurrence.type !== "weekdays" && (
              <NumberInput
                size="sm"
                min={1}
                max={99}
                value={recurrence.interval || 1}
                onValueChange={v => v != null && v >= 1 && save({ interval: v })}
                wrapperClassName="w-[64px] flex-none"
              />
            )}
            <Segmented
              label={t("repeat.unit")}
              size="sm"
              value={recurrence.type}
              onValueChange={(type: RecurrenceType) =>
                save({
                  type,
                  weekdays: type === "weekly" ? weekdays : null,
                  monthDay: type === "monthly" ? (recurrence.monthDay ?? start.getDate()) : null,
                })
              }
            >
              {REC_TYPES.map(option => (
                <Segmented.Item
                  key={option.value}
                  value={option.value}
                  label={
                    option.value === "weekdays"
                      ? t("repeat.weekdays")
                      : todosCount(`repeat.units.${option.value}`, recurrence.interval || 1)
                  }
                />
              ))}
            </Segmented>
          </div>

          {recurrence.type === "weekly" && (
            <div className="flex items-center gap-2">
              <span className="text-ink-2 w-9 shrink-0">{t("repeat.weekDays")}</span>
              <div className="flex gap-1">
                {WEEK_ORDER.map(d => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? weekdays.filter(x => x !== d) : [...weekdays, d];
                        if (next.length) save({ weekdays: next });
                      }}
                      className={cn(
                        "grid size-[26px] place-items-center rounded-[7px] text-[12px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                        on
                          ? "bg-accent-soft text-accent-text font-semibold"
                          : "border-line-1 text-ink-2 hover:bg-hover border"
                      )}
                    >
                      {weekdayName(d, locale, "narrow")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {recurrence.type === "monthly" && (
            <div className="flex items-center gap-2">
              <span className="text-ink-2 w-9 shrink-0">{t("repeat.date")}</span>
              <span className="text-ink-3">
                {t("repeat.monthDate", { day: "\uFFFC" }).split("\uFFFC")[0]}
              </span>
              <NumberInput
                size="sm"
                min={1}
                max={31}
                value={recurrence.monthDay ?? start.getDate()}
                onValueChange={v => v != null && v >= 1 && v <= 31 && save({ monthDay: v })}
                wrapperClassName="w-[64px] flex-none"
              />
              <span className="text-ink-3">
                {t("repeat.monthDate", { day: "\uFFFC" }).split("\uFFFC")[1]}
              </span>
            </div>
          )}

          <Switch
            size="sm"
            label={t("repeat.holidays")}
            checked={recurrence.excludeHolidays}
            onCheckedChange={checked => save({ excludeHolidays: checked })}
          />
          <p className="text-ink-3 text-[11.5px]">{t("repeat.hint")}</p>
        </div>
      </Popover.Body>
    </Popover>
  );
}

/* ---------- 行骨架 ---------- */

function Field({
  icon: Icon,
  label,
  align = "center",
  children,
}: {
  icon: typeof Folder;
  label: string;
  align?: "center" | "start";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-h-8 grid-cols-[72px_minmax(0,1fr)] gap-2.5",
        align === "start" ? "items-start py-1" : "items-center"
      )}
    >
      <span
        className={cn(
          "text-ink-3 flex items-center gap-1.5 text-[12px]",
          align === "start" && "leading-[26px]"
        )}
      >
        <Icon className="size-[13px]" strokeWidth={1.75} />
        {label}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px]">{children}</span>
    </div>
  );
}

function FieldButton({
  children,
  muted,
  ...props
}: { children: ReactNode; muted?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "border-line-1 bg-surface hover:border-ink-3 inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-2.5 text-[12.5px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
        muted ? "text-ink-3" : "text-ink-1"
      )}
    >
      {children}
    </button>
  );
}
