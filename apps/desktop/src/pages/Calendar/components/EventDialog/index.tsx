import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { App } from "antd";
import useCalendarStore from "@/stores/useCalendarStore";
import { CreateCalendarEvent, UpdateCalendarEvent } from "@/types";
import { MdClose } from "react-icons/md";
import { getProjectColorValue, PROJECT_COLORS } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import dayjs from "dayjs";
import { Descendant } from "slate";
import { EditorRef } from "@tau/editor/src";
import { getContentById, createContent, updateContent } from "@/commands/content";
import CalendarDropdown from "./components/CalendarDropdown";
import DatePicker from "./components/DatePicker";
import TimePicker from "./components/TimePicker";
import EditorWrapper from "./components/EditorWrapper";
import ToggleSwitch from "./components/ToggleSwitch";
import "./index.css";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const EventDialog = () => {
  const { editingEvent, setEditingEvent, calendars, createEvent, updateEvent, deleteEvent } =
    useCalendarStore();
  const { modal } = App.useApp();
  const setting = useSettingStore(state => state.setting);
  const theme = setting.darkMode ? "dark" : "light";

  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [value, setValue] = useState<string>("");
  const [description, setDescription] = useState<Descendant[]>(DEFAULT_CONTENT);
  const editorRef = useRef<EditorRef>(null);

  // Check if current event belongs to system calendar
  const isSystemCalendarEvent = editingEvent
    ? calendars.find(c => c.id === editingEvent.calendarId)?.isInSystemGroup || false
    : false;

  useEffect(() => {
    const loadDescription = async () => {
      if (editingEvent) {
        setTitle(editingEvent.title);
        setCalendarId(editingEvent.calendarId);
        setStartDate(dayjs(editingEvent.startDate).format("YYYY-MM-DD"));
        setEndDate(editingEvent.endDate ? dayjs(editingEvent.endDate).format("YYYY-MM-DD") : "");
        setAllDay(editingEvent.allDay);
        setColor(editingEvent.color);
        setValue(
          editingEvent.value !== undefined && editingEvent.value !== null
            ? editingEvent.value.toString()
            : ""
        );

        if (!editingEvent.allDay && editingEvent.startTime !== null) {
          const startHours = Math.floor(editingEvent.startTime / 60);
          const startMins = editingEvent.startTime % 60;
          setStartTime(
            `${startHours.toString().padStart(2, "0")}:${startMins.toString().padStart(2, "0")}`
          );
        }

        if (!editingEvent.allDay && editingEvent.endTime !== null) {
          const endHours = Math.floor(editingEvent.endTime / 60);
          const endMins = editingEvent.endTime % 60;
          setEndTime(
            `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`
          );
        }

        // Load description content - prioritize preloaded content
        if (editingEvent.detailContent) {
          // Use preloaded content first
          setDescription(editingEvent.detailContent);
          editorRef.current?.setEditorValue(editingEvent.detailContent);
        } else if (editingEvent.detailContentId && editingEvent.detailContentId !== 0) {
          // Fallback: fetch asynchronously if no preloaded content
          try {
            const content = await getContentById(editingEvent.detailContentId);
            if (content?.content) {
              setDescription(content.content);
              editorRef.current?.setEditorValue(content.content);
            } else {
              setDescription(DEFAULT_CONTENT);
              editorRef.current?.setEditorValue(DEFAULT_CONTENT);
            }
          } catch (error) {
            console.error("Failed to load description:", error);
            setDescription(DEFAULT_CONTENT);
            editorRef.current?.setEditorValue(DEFAULT_CONTENT);
          }
        } else {
          setDescription(DEFAULT_CONTENT);
          editorRef.current?.setEditorValue(DEFAULT_CONTENT);
        }
      } else {
        // Reset form - select first non-system calendar
        setTitle("");
        const firstNonSystemCalendar = calendars.find(c => !c.isInSystemGroup);
        setCalendarId(firstNonSystemCalendar?.id || calendars[0]?.id || 0);
        const today = new Date().toISOString().split("T")[0];
        setStartDate(today);
        setEndDate("");
        setStartTime("09:00");
        setEndTime("10:00");
        setAllDay(false);
        setColor(null);
        setValue("");
        setDescription(DEFAULT_CONTENT);
        editorRef.current?.setEditorValue(DEFAULT_CONTENT);
      }
    };

    loadDescription();
  }, [editingEvent, calendars]);

  const handleSave = async () => {
    if (!title || !calendarId) return;

    const startDateTs = dayjs(startDate).startOf("day").valueOf();
    const endDateTs = endDate ? dayjs(endDate).startOf("day").valueOf() : null;

    let startTimeMinutes: number | null = null;
    let endTimeMinutes: number | null = null;

    if (!allDay && startTime) {
      const [hours, mins] = startTime.split(":").map(Number);
      startTimeMinutes = hours * 60 + mins;
    }

    if (!allDay && endTime) {
      const [hours, mins] = endTime.split(":").map(Number);
      endTimeMinutes = hours * 60 + mins;
    }

    // Handle description content
    const hasContent = JSON.stringify(description) !== JSON.stringify(DEFAULT_CONTENT);
    let detailContentId = editingEvent?.detailContentId || 0;

    if (hasContent) {
      // If has content
      if (editingEvent && editingEvent.detailContentId !== 0) {
        // Update existing content
        await updateContent(editingEvent.detailContentId, description);
        detailContentId = editingEvent.detailContentId;
      } else {
        // Create new content
        const contentId = await createContent(description, 0);
        if (contentId) {
          detailContentId = contentId;
        }
      }
    } else {
      // If no content, keep original detailContentId (if exists)
      detailContentId = editingEvent?.detailContentId || 0;
    }

    // Handle value field
    const numericValue = value.trim() !== "" ? parseFloat(value) : undefined;

    if (editingEvent && editingEvent.id !== 0) {
      // Update existing event
      const updateData: UpdateCalendarEvent = {
        ...editingEvent,
        title,
        calendarId,
        detailContentId,
        startDate: startDateTs,
        endDate: endDateTs,
        startTime: startTimeMinutes,
        endTime: endTimeMinutes,
        allDay,
        color: color as any,
        value: numericValue,
      };
      await updateEvent(updateData);
    } else {
      // Create new event
      const createData: CreateCalendarEvent = {
        title,
        calendarId,
        detailContentId,
        startDate: startDateTs,
        endDate: endDateTs,
        startTime: startTimeMinutes,
        endTime: endTimeMinutes,
        allDay,
        color: color as any,
        value: numericValue,
      };
      await createEvent(createData);
    }

    setEditingEvent(null);
  };

  const handleDelete = () => {
    if (!editingEvent || editingEvent.id === 0) return;

    modal.confirm({
      title: "删除事件",
      content: `确定要删除事件“${editingEvent.title}”吗？此操作无法撤销。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      zIndex: 10000,
      onOk: async () => {
        await deleteEvent(editingEvent.id);
        setEditingEvent(null);
      },
    });
  };

  const isOpen = editingEvent !== null;

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => setEditingEvent(null)}
      >
        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 flex max-h-[90vh] w-full max-w-[720px] flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal Container */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex shrink-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/20">
                <svg
                  className="h-5 w-5 text-indigo-500"
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
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  {editingEvent.id !== 0 ? "编辑事件" : "新建事件"}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">管理日历事件详情</p>
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="event-modal-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {/* Form */}
              <div className="space-y-4">
                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    标题
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                    placeholder="事件标题"
                  />
                </div>

                {/* Calendar */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    日历
                  </label>
                  <CalendarDropdown
                    calendars={calendars}
                    selectedId={calendarId}
                    onSelect={setCalendarId}
                    disabled={isSystemCalendarEvent}
                  />
                  {calendars.find(c => c.id === calendarId)?.isInSystemGroup && (
                    <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                      注意：系统日历事件的时间和日历归属不可修改
                    </p>
                  )}
                </div>

                <div>
                  <ToggleSwitch
                    checked={allDay}
                    onChange={setAllDay}
                    disabled={isSystemCalendarEvent}
                    label="全天"
                  />
                </div>

                {/* Start Date and Time */}
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    disabled={isSystemCalendarEvent}
                    label="开始日期"
                  />
                  {!allDay && (
                    <TimePicker
                      value={startTime}
                      onChange={setStartTime}
                      disabled={isSystemCalendarEvent}
                      label="开始时间"
                    />
                  )}
                </div>

                {/* End Date and Time */}
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    disabled={isSystemCalendarEvent}
                    label="结束日期"
                  />
                  {!allDay && (
                    <TimePicker
                      value={endTime}
                      onChange={setEndTime}
                      disabled={isSystemCalendarEvent}
                      label="结束时间"
                    />
                  )}
                </div>

                {/* Color Picker */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    颜色
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.slice(0, 12).map(c => {
                      const colorValue = getProjectColorValue(c.name, theme);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => !isSystemCalendarEvent && setColor(c.name)}
                          disabled={isSystemCalendarEvent}
                          className={`h-10 w-10 rounded-full transition-all ${
                            color === c.name
                              ? "scale-110 ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900"
                              : "hover:scale-105"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                          style={{ backgroundColor: colorValue }}
                          title={c.label}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Value */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    数值（可选）
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={e => {
                      const val = e.target.value;
                      // 只允许数字、小数点和负号，且格式合法
                      if (val === "" || /^-?\d*\.?\d*$/.test(val)) {
                        setValue(val);
                      }
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                    placeholder="如时间成本、金额等"
                  />
                </div>

                {/* Description */}
                <EditorWrapper
                  value={description}
                  onChange={setDescription}
                  editorRef={editorRef}
                  readonly={false}
                />
              </div>
            </div>
            <div className="mt-4 flex shrink-0 items-center justify-between border-t border-white/20 pt-4 dark:border-white/10">
              <div>
                {editingEvent && editingEvent.id !== 0 && !isSystemCalendarEvent && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(239,68,68,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-red-600 active:translate-y-0"
                  >
                    删除
                  </button>
                )}
              </div>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!title || !calendarId}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default EventDialog;
