import { useMemo, useRef, useEffect } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { formatTime } from "@/utils/calendar";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import { CalendarEvent } from "@/types";
import dayjs from "dayjs";
import Editor, { EditorRef } from "@/components/Editor";
import { hexToRgba } from "../../utils";
import "./index.module.less";

const AgendaView = () => {
  const { currentDate, calendars, setEditingEvent } = useCalendarStore();
  const { events } = useCalendarEvents();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  // 存储每个事件的 Editor ref
  const editorRefsMap = useRef<Map<string, EditorRef>>(new Map());

  const date = new Date(currentDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  // 按天组织事件（只显示单日非全天事件）
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();

    if (!events) return grouped;

    events.forEach((event) => {
      // 过滤掉全天事件
      if (event.allDay) return;

      const eventStart = dayjs(event.startDate);
      const eventEnd = event.endDate ? dayjs(event.endDate) : eventStart;

      // 只保留单日事件（开始和结束在同一天）
      if (!eventStart.isSame(eventEnd, "day")) return;

      const dayKey = eventStart.format("YYYY-MM-DD");
      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
      }
      grouped.get(dayKey)!.push(event);
    });

    // 排序：按 startTime 升序
    grouped.forEach((dayEvents) => {
      dayEvents.sort((a, b) => {
        const aTime = a.startTime ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.startTime ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    });

    return grouped;
  }, [events]);

  // 获取当月的所有日期
  const daysInMonth = useMemo(() => {
    const days: string[] = [];
    const daysCount = dayjs(`${year}-${month}-01`).daysInMonth();
    for (let day = 1; day <= daysCount; day++) {
      const dayKey = dayjs(`${year}-${month}-${day}`).format("YYYY-MM-DD");
      days.push(dayKey);
    }
    return days;
  }, [year, month]);

  // 只显示有事件的日期
  const daysWithEvents = daysInMonth.filter((dayKey) =>
    eventsByDay.has(dayKey),
  );

  // 当事件内容变化时，更新对应的 Editor
  useEffect(() => {
    if (!events) return;

    events.forEach((event) => {
      const editorRef = editorRefsMap.current.get(String(event.id));
      if (editorRef && event.detailContent) {
        editorRef.setEditorValue(event.detailContent);
      }
    });
  }, [events]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-[var(--main-bg-color)]">
      <div className="flex-1 overflow-y-auto">
        {daysWithEvents.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
            本月没有日程
          </div>
        ) : (
          daysWithEvents.map((dayKey) => {
            const dayEvents = eventsByDay.get(dayKey)!;
            const dayDate = dayjs(dayKey);
            const isToday = dayDate.isSame(dayjs(), "day");

            return (
              <div
                key={dayKey}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                {/* 事件列表 */}
                <div>
                  {dayEvents.map((event, index) => {
                    const calendar = calendars.find(
                      (c) => c.id === event.calendarId,
                    );
                    const color = event.color || calendar?.color || "blue";
                    const colorValue = getProjectColorValue(
                      color,
                      theme === "dark" ? "dark" : "light",
                    );

                    // 判断是否有描述内容
                    const hasDescription =
                      event.detailContent &&
                      event.detailContent.length > 0 &&
                      !(
                        event.detailContent.length === 1 &&
                        event.detailContent[0].type === "paragraph" &&
                        event.detailContent[0].children.length === 1 &&
                        event.detailContent[0].children[0].type ===
                          "formatted" &&
                        (event.detailContent[0].children[0] as any).text === ""
                      );

                    return (
                      <div
                        key={event.id}
                        onClick={() => setEditingEvent(event)}
                        className="group flex cursor-pointer gap-4 px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        {/* 左侧：日期（只在第一个事件显示） */}
                        {index === 0 && (
                          <div className="flex-shrink-0 w-16 text-center">
                            <div
                              className={`text-4xl font-light ${
                                isToday
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-gray-900 dark:text-white"
                              }`}
                            >
                              {dayDate.format("D")}
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {
                                [
                                  "周日",
                                  "周一",
                                  "周二",
                                  "周三",
                                  "周四",
                                  "周五",
                                  "周六",
                                ][dayDate.day()]
                              }
                            </div>
                            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                              {dayDate.format("M月")}
                            </div>
                          </div>
                        )}
                        {index > 0 && (
                          <div className="w-16 flex-shrink-0"></div>
                        )}

                        {/* 中间：时间圆圈和起始时间 */}
                        <div className="flex flex-col items-center flex-shrink-0 pt-2">
                          {/* 圆圈 */}
                          <div
                            className="w-3 h-3 rounded-full border-2 bg-white dark:bg-gray-900"
                            style={{ borderColor: colorValue }}
                          ></div>
                          {/* 起始时间 */}
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {event.allDay
                              ? "全天"
                              : event.startTime !== null &&
                                formatTime(event.startTime)}
                          </div>
                        </div>

                        {/* 右侧：事件卡片 */}
                        <div className="flex-1 min-w-0 relative ml-4">
                          <div
                            className="border-l-4 px-4 py-3 rounded"
                            style={{
                              borderLeftColor: colorValue,
                              backgroundColor: hexToRgba(colorValue, 0.1),
                            }}
                          >
                            {/* 第一行：时间范围 */}
                            {!event.allDay &&
                              event.startTime !== null &&
                              event.endTime !== null && (
                                <div
                                  className="text-sm font-medium mb-1"
                                  style={{ color: colorValue }}
                                >
                                  {formatTime(event.startTime)} -{" "}
                                  {formatTime(event.endTime)}
                                </div>
                              )}

                            {/* 第二行：标题 */}
                            <div className="text-base font-medium text-gray-900 dark:text-white mb-1">
                              {event.title}
                            </div>

                            {/* 第三行：描述 */}
                            {hasDescription && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                <Editor
                                  ref={(ref) => {
                                    if (ref) {
                                      editorRefsMap.current.set(
                                        String(event.id),
                                        ref,
                                      );
                                    }
                                  }}
                                  initValue={event.detailContent}
                                  readonly={true}
                                  className="agenda-view-editor"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AgendaView;
