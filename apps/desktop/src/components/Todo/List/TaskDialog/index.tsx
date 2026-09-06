import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose } from "react-icons/md";
import dayjs from "dayjs";
import { TodoItemType, RecurrenceType } from "@/types";
import DateTimePicker from "./components/DateTimePicker";
import RecurrenceConfig from "./components/RecurrenceConfig";
import ReminderSelect from "./components/ReminderSelect";
import "./index.css";

interface TaskDialogProps {
  visible: boolean;
  taskType: TodoItemType;
  taskTitle: string;
  onConfirm: (data: TaskCreationData) => void;
  onCancel: () => void;
}

export interface TaskCreationData {
  title: string;
  type: TodoItemType;
  dueAt?: number | null;
  startAt?: number | null;
  remindBefore?: number | null;
  recurrence?: {
    type: RecurrenceType;
    interval: number;
    weekdays?: number[];
    monthDay?: number;
    excludeHolidays: boolean;
    startDate: number;
    endDate?: number | null;
    maxOccurrences?: number | null;
  };
}

const TaskDialog = ({ visible, taskType, taskTitle, onConfirm, onCancel }: TaskDialogProps) => {
  // Deadline task state
  const [dueAt, setDueAt] = useState<dayjs.Dayjs | null>(null);
  const [remindBefore, setRemindBefore] = useState<number | null>(null);

  // Planned task state
  const [startAt, setStartAt] = useState<dayjs.Dayjs | null>(null);
  const [endAt, setEndAt] = useState<dayjs.Dayjs | null>(null);

  // Recurring task state
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("daily");
  const [interval, setInterval] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState<number | null>(null);
  const [excludeHolidays, setExcludeHolidays] = useState(false);
  const [startDate, setStartDate] = useState<dayjs.Dayjs>(dayjs());
  const [endMode, setEndMode] = useState<"never" | "date" | "count">("never");
  const [endDate, setEndDate] = useState<dayjs.Dayjs | null>(null);
  const [maxOccurrences, setMaxOccurrences] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      // Reset form when dialog opens
      setDueAt(null);
      setRemindBefore(null);
      setStartAt(null);
      setEndAt(null);
      setRecurrenceType("daily");
      setInterval(1);
      setWeekdays([]);
      setMonthDay(null);
      setExcludeHolidays(false);
      setStartDate(dayjs());
      setEndMode("never");
      setEndDate(null);
      setMaxOccurrences(null);
    }
  }, [visible]);

  const handleSave = () => {
    const data: TaskCreationData = {
      title: taskTitle,
      type: taskType,
    };

    if (taskType === "deadline") {
      if (!dueAt) return;
      data.dueAt = dueAt.valueOf();
      data.remindBefore = remindBefore;
    } else if (taskType === "planned") {
      if (!startAt || !endAt) return;
      data.startAt = startAt.valueOf();
      data.dueAt = endAt.valueOf();
      data.remindBefore = remindBefore;
    } else if (taskType === "recurring") {
      data.recurrence = {
        type: recurrenceType,
        interval,
        weekdays: recurrenceType === "weekly" ? weekdays : undefined,
        monthDay: recurrenceType === "monthly" ? monthDay || undefined : undefined,
        excludeHolidays,
        startDate: startDate.valueOf(),
        endDate: endMode === "date" && endDate ? endDate.valueOf() : null,
        maxOccurrences: endMode === "count" ? maxOccurrences : null,
      };
    }

    onConfirm(data);
  };

  const getDialogTitle = () => {
    switch (taskType) {
      case "deadline":
        return "截止任务";
      case "planned":
        return "计划任务";
      case "recurring":
        return "周期任务";
      default:
        return "创建任务";
    }
  };

  const getDialogIcon = () => {
    switch (taskType) {
      case "deadline":
        return (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case "planned":
        return (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        );
      case "recurring":
        return (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        );
      default:
        return null;
    }
  };

  const canSave = () => {
    if (taskType === "deadline") {
      return dueAt !== null;
    } else if (taskType === "planned") {
      return startAt !== null && endAt !== null;
    } else if (taskType === "recurring") {
      if (recurrenceType === "weekly" && weekdays.length === 0) return false;
      if (recurrenceType === "monthly" && !monthDay) return false;
      if (endMode === "date" && !endDate) return false;
      if (endMode === "count" && (!maxOccurrences || maxOccurrences < 1)) return false;
      return true;
    }
    return false;
  };

  if (!visible) return null;

  return createPortal(
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      >
        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 flex max-h-[90vh] w-full max-w-[560px] flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal Content */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex shrink-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 text-[var(--th-accent)] dark:border-indigo-500/30 dark:bg-indigo-500/20">
                {getDialogIcon()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  {getDialogTitle()}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">{taskTitle}</p>
              </div>
              <button
                onClick={onCancel}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="task-dialog-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-4">
                {/* Deadline Task Form */}
                {taskType === "deadline" && (
                  <>
                    <DateTimePicker label="截止时间" value={dueAt} onChange={setDueAt} required />
                    <ReminderSelect value={remindBefore} onChange={setRemindBefore} />
                  </>
                )}

                {/* Planned Task Form */}
                {taskType === "planned" && (
                  <>
                    <DateTimePicker
                      label="开始时间"
                      value={startAt}
                      onChange={setStartAt}
                      required
                    />
                    <DateTimePicker label="结束时间" value={endAt} onChange={setEndAt} required />
                    <ReminderSelect value={remindBefore} onChange={setRemindBefore} />
                  </>
                )}

                {/* Recurring Task Form */}
                {taskType === "recurring" && (
                  <RecurrenceConfig
                    recurrenceType={recurrenceType}
                    onRecurrenceTypeChange={setRecurrenceType}
                    interval={interval}
                    onIntervalChange={setInterval}
                    weekdays={weekdays}
                    onWeekdaysChange={setWeekdays}
                    monthDay={monthDay}
                    onMonthDayChange={setMonthDay}
                    excludeHolidays={excludeHolidays}
                    onExcludeHolidaysChange={setExcludeHolidays}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endMode={endMode}
                    onEndModeChange={setEndMode}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    maxOccurrences={maxOccurrences}
                    onMaxOccurrencesChange={setMaxOccurrences}
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-white/20 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={onCancel}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave()}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              >
                创建
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default TaskDialog;
