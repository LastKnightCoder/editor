import { useState, useEffect } from "react";
import { App } from "antd";
import useCalendarStore from "@/stores/useCalendarStore";
import { CreateCalendarEvent, UpdateCalendarEvent } from "@/types";
import { MdClose } from "react-icons/md";
import {
  getProjectColorValue,
  PROJECT_COLORS,
} from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import dayjs from "dayjs";

const EventDialog = () => {
  const {
    editingEvent,
    setEditingEvent,
    calendars,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useCalendarStore();
  const { setting } = useSettingStore();
  const { modal } = App.useApp();
  const theme = setting.darkMode ? "dark" : "light";

  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (editingEvent) {
      setTitle(editingEvent.title);
      setCalendarId(editingEvent.calendarId);
      setStartDate(dayjs(editingEvent.startDate).format("YYYY-MM-DD"));
      setEndDate(
        editingEvent.endDate
          ? dayjs(editingEvent.endDate).format("YYYY-MM-DD")
          : "",
      );
      setAllDay(editingEvent.allDay);
      setColor(editingEvent.color);

      if (!editingEvent.allDay && editingEvent.startTime !== null) {
        const startHours = Math.floor(editingEvent.startTime / 60);
        const startMins = editingEvent.startTime % 60;
        setStartTime(
          `${startHours.toString().padStart(2, "0")}:${startMins.toString().padStart(2, "0")}`,
        );
      }

      if (!editingEvent.allDay && editingEvent.endTime !== null) {
        const endHours = Math.floor(editingEvent.endTime / 60);
        const endMins = editingEvent.endTime % 60;
        setEndTime(
          `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`,
        );
      }
    } else {
      // 重置表单
      setTitle("");
      setCalendarId(calendars[0]?.id || 0);
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
      setEndDate("");
      setStartTime("09:00");
      setEndTime("10:00");
      setAllDay(false);
      setColor(null);
    }
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

    if (editingEvent && editingEvent.id !== 0) {
      // 更新现有事件
      const updateData: UpdateCalendarEvent = {
        ...editingEvent,
        title,
        calendarId,
        startDate: startDateTs,
        endDate: endDateTs,
        startTime: startTimeMinutes,
        endTime: endTimeMinutes,
        allDay,
        color: color as any,
      };
      await updateEvent(updateData);
    } else {
      // 创建新事件
      const createData: CreateCalendarEvent = {
        title,
        calendarId,
        detailContentId: 0,
        startDate: startDateTs,
        endDate: endDateTs,
        startTime: startTimeMinutes,
        endTime: endTimeMinutes,
        allDay,
        color: color as any,
      };
      await createEvent(createData);
    }

    setEditingEvent(null);
  };

  const handleDelete = () => {
    if (editingEvent && editingEvent.id !== 0) {
      modal.confirm({
        title: "删除事件",
        content: "确定要删除这个事件吗？",
        okText: "删除",
        okType: "danger",
        cancelText: "取消",
        onOk: async () => {
          await deleteEvent(editingEvent.id);
          setEditingEvent(null);
        },
      });
    }
  };

  const isOpen = editingEvent !== null;

  return (
    <>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
            onClick={() => setEditingEvent(null)}
          />
          {/* 侧边弹窗 */}
          <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-800 animate-in slide-in-from-right duration-200">
            <div className="flex-1 overflow-y-auto p-6">
              {/* 头部 */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {editingEvent ? "编辑事件" : "新建事件"}
                </h3>
                <button
                  onClick={() => setEditingEvent(null)}
                  className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </div>

              {/* 表单 */}
              <div className="space-y-4">
                {/* 标题 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    标题
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="事件标题"
                  />
                </div>

                {/* 选择日历 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    日历
                  </label>
                  <select
                    value={calendarId}
                    onChange={(e) => setCalendarId(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  >
                    {calendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 全天 */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    全天
                  </label>
                </div>

                {/* 开始日期和时间 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      开始日期
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  {!allDay && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        开始时间
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                  )}
                </div>

                {/* 结束日期和时间 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      结束日期
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  {!allDay && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        结束时间
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                  )}
                </div>

                {/* 颜色选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    颜色
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PROJECT_COLORS.slice(0, 12).map((c) => {
                      const colorValue = getProjectColorValue(
                        c.name,
                        theme === "dark" ? "dark" : "light",
                      );
                      return (
                        <button
                          key={c.name}
                          onClick={() => setColor(c.name)}
                          className={`h-8 w-8 rounded-full ${color === c.name ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}
                          style={{ backgroundColor: colorValue }}
                          title={c.label}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 底部按钮栏 - 固定在底部 */}
            <div className="border-t border-gray-200 p-4 dark:border-gray-700">
              <div className="flex justify-between">
                {editingEvent && editingEvent.id !== 0 && (
                  <button
                    onClick={handleDelete}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    删除
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => setEditingEvent(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default EventDialog;
