import { useState, useEffect, memo } from "react";
import { App } from "antd";
import { MdClose } from "react-icons/md";
import useCalendarStore from "@/stores/useCalendarStore";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import { getEventsByCalendarId } from "@/commands";

interface MergeCalendarsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCalendarIds: number[];
}

const MergeCalendarsDialog = memo(
  ({ isOpen, onClose, sourceCalendarIds }: MergeCalendarsDialogProps) => {
    const { calendars, mergeCalendars, toggleCalendarForMerge } =
      useCalendarStore();
    const { setting } = useSettingStore();
    const { modal, message } = App.useApp();
    const theme = setting.darkMode ? "dark" : "light";

    const [targetCalendarId, setTargetCalendarId] = useState<number | null>(
      null,
    );
    const [eventCounts, setEventCounts] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(false);

    // 获取源日历和可选的目标日历
    const sourceCalendars = calendars.filter((c) =>
      sourceCalendarIds.includes(c.id),
    );
    const availableTargetCalendars = calendars.filter(
      (c) =>
        !sourceCalendarIds.includes(c.id) && !c.isInSystemGroup && !c.archived,
    );

    // 加载事件数量
    useEffect(() => {
      if (isOpen && sourceCalendarIds.length > 0) {
        const loadEventCounts = async () => {
          const counts: Record<number, number> = {};
          for (const calendarId of sourceCalendarIds) {
            try {
              const events = await getEventsByCalendarId(calendarId);
              counts[calendarId] = events.length;
            } catch (error) {
              counts[calendarId] = 0;
            }
          }
          setEventCounts(counts);
        };
        loadEventCounts();
      }
    }, [isOpen, sourceCalendarIds]);

    // 计算总事件数
    const totalEvents = Object.values(eventCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!targetCalendarId) {
        message.warning("请选择目标日历");
        return;
      }

      if (sourceCalendarIds.length === 0) {
        message.warning("没有选择要合并的日历");
        return;
      }

      modal.confirm({
        title: "确认合并日历",
        content: (
          <div>
            <p>
              将 <strong>{sourceCalendars.length}</strong> 个日历（共{" "}
              <strong>{totalEvents}</strong>{" "}
              个事件）合并到目标日历，源日历将被删除。
            </p>
            <p className="mt-2 text-gray-500">此操作不可撤销，确定要继续吗？</p>
          </div>
        ),
        okText: "确定合并",
        okType: "danger",
        cancelText: "取消",
        onOk: async () => {
          setLoading(true);
          try {
            const result = await mergeCalendars(
              sourceCalendarIds,
              targetCalendarId,
            );
            message.success(
              `成功合并 ${result.deletedCalendars} 个日历，转移了 ${result.transferredEvents} 个事件`,
            );
            onClose();
          } catch (error) {
            console.error("Failed to merge calendars:", error);
            message.error(
              error instanceof Error ? error.message : "合并日历失败，请重试",
            );
          } finally {
            setLoading(false);
          }
        },
      });
    };

    const handleRemoveSource = (calendarId: number) => {
      toggleCalendarForMerge(calendarId);
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50">
        <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
          {/* 头部 */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              合并日历
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 源日历列表 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                要合并的日历（{sourceCalendars.length} 个，共 {totalEvents}{" "}
                个事件）
              </label>
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                {sourceCalendars.map((calendar) => {
                  const color = getProjectColorValue(
                    calendar.color,
                    theme === "dark" ? "dark" : "light",
                  );
                  const eventCount = eventCounts[calendar.id] || 0;

                  return (
                    <div
                      key={calendar.id}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2 dark:bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {calendar.title}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({eventCount} 个事件)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSource(calendar.id)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        移除
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 目标日历选择 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                合并到（选择目标日历）
              </label>
              {availableTargetCalendars.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                  没有可用的目标日历
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  {availableTargetCalendars.map((calendar) => {
                    const color = getProjectColorValue(
                      calendar.color,
                      theme === "dark" ? "dark" : "light",
                    );
                    const isSelected = targetCalendarId === calendar.id;

                    return (
                      <button
                        key={calendar.id}
                        type="button"
                        onClick={() => setTargetCalendarId(calendar.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "bg-blue-100 dark:bg-blue-900/30"
                            : "bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                        }`}
                      >
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {calendar.title}
                        </span>
                        {calendar.groupId && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            (
                            {
                              useCalendarStore
                                .getState()
                                .calendarGroups.find(
                                  (g) => g.id === calendar.groupId,
                                )?.name
                            }
                            )
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 提示信息 */}
            <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️
                合并后，源日历将被删除，所有事件将转移到目标日历。此操作不可撤销。
              </p>
            </div>

            {/* 按钮 */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  !targetCalendarId ||
                  sourceCalendarIds.length === 0 ||
                  availableTargetCalendars.length === 0
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
              >
                {loading ? "合并中..." : "合并日历"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  },
);

MergeCalendarsDialog.displayName = "MergeCalendarsDialog";

export default MergeCalendarsDialog;
