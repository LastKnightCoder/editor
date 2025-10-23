import { useState, useRef, useEffect } from "react";
import { App } from "antd";
import useCalendarStore from "@/stores/useCalendarStore";
import {
  MdAdd,
  MdMoreVert,
  MdVisibility,
  MdVisibilityOff,
  MdEdit,
  MdArchive,
  MdDelete,
} from "react-icons/md";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import CreateCalendarDialog from "../CreateCalendarDialog";
import EditCalendarDialog from "../EditCalendarDialog";
import { Calendar } from "@/types";

const CalendarSidebar = () => {
  const {
    calendars,
    selectedCalendarIds,
    toggleCalendarVisibility,
    deleteCalendar,
    archiveCalendar,
  } = useCalendarStore();
  const { setting } = useSettingStore();
  const { modal } = App.useApp();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [openMenuCalendarId, setOpenMenuCalendarId] = useState<number | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = setting.darkMode ? "dark" : "light";

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuCalendarId(null);
      }
    };

    if (openMenuCalendarId !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openMenuCalendarId]);

  return (
    <div className="hidden w-64 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-[var(--main-bg-color)] lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <MdAdd className="h-5 w-5" />
            创建日历
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
            我的日历
          </h3>
          <div className="space-y-1">
            {calendars
              .filter((cal) => !cal.archived)
              .map((calendar) => {
                const isSelected = selectedCalendarIds.includes(calendar.id);
                const color = getProjectColorValue(
                  calendar.color,
                  theme === "dark" ? "dark" : "light",
                );

                return (
                  <div
                    key={calendar.id}
                    className="group relative flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <div className="flex flex-1 items-center gap-2 overflow-hidden">
                      <button
                        onClick={() => toggleCalendarVisibility(calendar.id)}
                        className="flex-shrink-0"
                      >
                        {isSelected ? (
                          <MdVisibility className="h-5 w-5" style={{ color }} />
                        ) : (
                          <MdVisibilityOff className="h-5 w-5 text-gray-400" />
                        )}
                      </button>
                      <span
                        className="truncate text-sm"
                        style={{
                          color: isSelected ? "inherit" : "rgb(156, 163, 175)",
                        }}
                      >
                        {calendar.title}
                      </span>
                    </div>
                    <div className="relative">
                      <button
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuCalendarId(
                            openMenuCalendarId === calendar.id
                              ? null
                              : calendar.id,
                          );
                        }}
                      >
                        <MdMoreVert className="h-5 w-5 text-gray-400" />
                      </button>

                      {openMenuCalendarId === calendar.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                        >
                          <button
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={() => {
                              setEditingCalendar(calendar);
                              setOpenMenuCalendarId(null);
                            }}
                          >
                            <MdEdit className="h-4 w-4" />
                            编辑
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={async () => {
                              await archiveCalendar(calendar.id);
                              setOpenMenuCalendarId(null);
                            }}
                          >
                            <MdArchive className="h-4 w-4" />
                            归档
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={() => {
                              modal.confirm({
                                title: "删除日历",
                                content: `确定要删除日历 "${calendar.title}" 吗？这将同时删除所有相关事件。`,
                                okText: "删除",
                                okType: "danger",
                                cancelText: "取消",
                                onOk: async () => {
                                  await deleteCalendar(calendar.id);
                                },
                              });
                              setOpenMenuCalendarId(null);
                            }}
                          >
                            <MdDelete className="h-4 w-4" />
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* 创建日历对话框 */}
      <CreateCalendarDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />

      {/* 编辑日历对话框 */}
      <EditCalendarDialog
        calendar={editingCalendar}
        onClose={() => setEditingCalendar(null)}
      />
    </div>
  );
};

export default CalendarSidebar;
