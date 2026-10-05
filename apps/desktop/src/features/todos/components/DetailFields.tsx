/**
 * 抽屉详情 · 属性区：项目 / 类型 / 时间（截止 · 计划起止）/ 重复规则 / 提醒 / 日程同步说明 / 已投入专注（只读）。
 * 每项即改即存（无保存按钮）；日历同步由主进程 updateItem 内部完成。
 * 重复规则可改（legacy 创建后只读）：类型 / 间隔 / 周几 / 每月几号 / 排除节假日。
 */

import dayjs from "dayjs";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock,
  Flag,
  Folder,
  List,
  Repeat,
  Timer,
} from "lucide-react";
import { useTodoFocusSummary } from "@/features/pomodoro/queries";
import {
  DatePicker,
  Menu,
  NumberInput,
  Popover,
  Segmented,
  Switch,
  cn,
  type DatePickerPreset,
} from "@tau/ui";
import type { RecurrenceType, TodoGroup, TodoItemType, TodoRecurrence } from "@/types";
import type { ComponentProps, ReactNode } from "react";
import { REMIND_OPTIONS, recurrenceText, remindText, startOfDay } from "../model";
import type { TodoMutations } from "../queries";
import type { TodoEntry } from "../types";
import { GroupDot } from "./TodoBits";

const toPicker = (ts: number | null | undefined) =>
  ts == null ? null : dayjs(ts).format("YYYY-MM-DD HH:mm");
const fromPicker = (value: string | null) => (value ? dayjs(value).valueOf() : null);

const PRESETS: DatePickerPreset[] = [
  { label: "今天", value: () => dayjs().startOf("day").format("YYYY-MM-DD HH:mm") },
  { label: "明天", value: () => dayjs().add(1, "day").startOf("day").format("YYYY-MM-DD HH:mm") },
  {
    label: "下周一",
    value: () =>
      dayjs()
        .add((8 - dayjs().day()) % 7 || 7, "day")
        .startOf("day")
        .format("YYYY-MM-DD HH:mm"),
  },
];

export function DetailFields({
  entry,
  groups,
  mutations,
}: {
  entry: TodoEntry;
  groups: TodoGroup[];
  mutations: TodoMutations;
}) {
  const group = groups.find(g => g.id === entry.groupId);
  const isChild = entry.parentId != null;

  return (
    <div className="flex flex-col gap-0.5">
      <Field icon={Folder} label="项目">
        {isChild ? (
          <span className="text-ink-2 flex items-center gap-1.5 text-[12.5px]">
            <GroupDot color={group?.color} className="size-[7px]" />
            {group?.title ?? "—"}
            <span className="text-ink-3">· 随父任务</span>
          </span>
        ) : (
          <Menu
            trigger={
              <FieldButton>
                <GroupDot color={group?.color} className="size-[7px]" />
                {group?.title ?? "选择项目"}
                <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
              </FieldButton>
            }
          >
            <Menu.Group>移动到项目</Menu.Group>
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

      <Field icon={List} label="类型">
        <Segmented
          label="任务类型"
          size="sm"
          value={entry.type}
          onValueChange={(type: TodoItemType) => void mutations.changeType(entry, type)}
        >
          <Segmented.Item value="normal" label="普通" />
          <Segmented.Item value="deadline" icon={Flag} label="截止" />
          <Segmented.Item value="planned" icon={Clock} label="计划" />
          <Segmented.Item value="recurring" icon={Repeat} label="周期" />
        </Segmented>
      </Field>

      {entry.type === "deadline" && (
        <Field icon={Flag} label="截止">
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
          <span className="text-ink-3 text-[11.5px]">00:00 视为全天</span>
        </Field>
      )}

      {entry.type === "planned" && (
        <Field icon={Clock} label="时间">
          <DatePicker
            size="sm"
            precision="minute"
            presets={PRESETS}
            value={toPicker(entry.startAt)}
            onValueChange={v => {
              const startAt = fromPicker(v);
              if (startAt == null) return;
              const dueAt =
                entry.dueAt != null && entry.dueAt > startAt ? entry.dueAt : startAt + 3_600_000;
              void mutations.updateItem(entry, { startAt, dueAt });
            }}
            className="w-[164px]"
          />
          <span className="text-ink-3">→</span>
          <DatePicker
            size="sm"
            precision="minute"
            value={toPicker(entry.dueAt)}
            isDateDisabled={day =>
              entry.startAt != null && dayjs(day).valueOf() < startOfDay(entry.startAt)
            }
            onValueChange={v => {
              const dueAt = fromPicker(v);
              if (dueAt != null) void mutations.updateItem(entry, { dueAt });
            }}
            className="w-[164px]"
          />
        </Field>
      )}

      {entry.type === "recurring" && entry.recurrence && (
        <Field icon={Repeat} label="重复">
          <RecurrenceEditor recurrence={entry.recurrence} mutations={mutations} />
          <span className="text-ink-3 text-[11.5px]">
            自 {dayjs(entry.recurrence.startDate).format("M月D日")} 起
            {entry.recurrence.endDate
              ? ` · 至 ${dayjs(entry.recurrence.endDate).format("M月D日")}`
              : entry.recurrence.maxOccurrences
                ? ` · 共 ${entry.recurrence.maxOccurrences} 次`
                : " · 永不结束"}
          </span>
        </Field>
      )}

      {(entry.type === "deadline" || entry.type === "planned") && (
        <Field icon={Bell} label="提醒">
          <Menu
            trigger={
              <FieldButton muted={entry.remindBefore == null}>
                {remindText(entry.remindBefore)}
                <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
              </FieldButton>
            }
          >
            <Menu.RadioGroup
              value={String(entry.remindBefore ?? "none")}
              onValueChange={v =>
                void mutations.updateItem(entry, { remindBefore: v === "none" ? null : Number(v) })
              }
            >
              {REMIND_OPTIONS.map(option => (
                <Menu.RadioItem key={option.label} value={String(option.value ?? "none")}>
                  {option.label}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu>
        </Field>
      )}

      {entry.type !== "normal" && (
        <Field icon={CalendarDays} label="日程">
          <span className="text-ink-3 text-[12px]">
            {entry.type === "recurring"
              ? "按规则显示在「待办清单 · 周期任务」日历"
              : `已同步到「待办清单 · ${entry.type === "deadline" ? "截止" : "计划"}任务」日历`}
          </span>
        </Field>
      )}

      <FocusField todoId={entry.id} />
    </div>
  );
}

/** 已投入：绑定到这条待办（含其日程）的番茄；没有时不显示 */
function FocusField({ todoId }: { todoId: number }) {
  const summary = useTodoFocusSummary(todoId);
  if (!summary?.count) return null;
  const minutes = Math.round(summary.focusMs / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <Field icon={Timer} label="专注">
      <span className="text-ink-2 text-[12px] tabular-nums">
        {summary.count} 🍅 · {h ? `${h}h` : ""}
        {m || !h ? `${m}m` : ""}
      </span>
    </Field>
  );
}

/* ---------- 重复规则编辑（Popover） ---------- */

const REC_TYPES: { value: RecurrenceType; label: string }[] = [
  { value: "daily", label: "天" },
  { value: "weekdays", label: "工作日" },
  { value: "weekly", label: "周" },
  { value: "monthly", label: "月" },
  { value: "yearly", label: "年" },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEK_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

function RecurrenceEditor({
  recurrence,
  mutations,
}: {
  recurrence: TodoRecurrence;
  mutations: TodoMutations;
}) {
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
          {recurrenceText(recurrence)}
          <ChevronDown className="text-ink-3 size-[13px]" strokeWidth={1.75} />
        </FieldButton>
      }
    >
      <Popover.Header>重复规则</Popover.Header>
      <Popover.Body>
        <div className="flex flex-col gap-3 pb-1 text-[12.5px]">
          <div className="flex items-center gap-2">
            <span className="text-ink-2 w-9 shrink-0">每</span>
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
              label="重复单位"
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
              {REC_TYPES.map(t => (
                <Segmented.Item key={t.value} value={t.value} label={t.label} />
              ))}
            </Segmented>
          </div>

          {recurrence.type === "weekly" && (
            <div className="flex items-center gap-2">
              <span className="text-ink-2 w-9 shrink-0">周几</span>
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
                      {WEEK_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {recurrence.type === "monthly" && (
            <div className="flex items-center gap-2">
              <span className="text-ink-2 w-9 shrink-0">日期</span>
              <NumberInput
                size="sm"
                min={1}
                max={31}
                value={recurrence.monthDay ?? start.getDate()}
                onValueChange={v => v != null && v >= 1 && v <= 31 && save({ monthDay: v })}
                wrapperClassName="w-[64px] flex-none"
              />
              <span className="text-ink-3">号</span>
            </div>
          )}

          <Switch
            size="sm"
            label="排除法定节假日"
            checked={recurrence.excludeHolidays}
            onCheckedChange={checked => save({ excludeHolidays: checked })}
          />
          <p className="text-ink-3 text-[11.5px]">改动即时保存；过去的打卡记录不受影响。</p>
        </div>
      </Popover.Body>
    </Popover>
  );
}

/* ---------- 行骨架 ---------- */

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Folder;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-8 grid-cols-[72px_minmax(0,1fr)] items-center gap-2.5">
      <span className="text-ink-3 flex items-center gap-1.5 text-[12px]">
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
