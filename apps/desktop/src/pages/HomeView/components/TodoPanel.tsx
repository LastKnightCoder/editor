import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { CheckSquare, ArrowRight, Circle, CheckCircle2, AlertCircle } from "lucide-react";
import { toggleCompleteCascade } from "@/commands/todo";
import type { TodoItem } from "@/types/todo";
import type { WorkbenchTodoGroupStat } from "@/types/components-workbench";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface TodoPanelProps {
  items: TodoItem[];
  groups: WorkbenchTodoGroupStat[];
  pendingTotal: number;
  overdueTotal: number;
  onRefresh: () => void;
}

const TodoPanel: React.FC<TodoPanelProps> = ({
  items,
  groups,
  pendingTotal,
  overdueTotal,
  onRefresh,
}) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();
  const previewItems = items.slice(0, 5);

  const handleToggle = async (item: TodoItem) => {
    await toggleCompleteCascade(item.id, !item.isCompleted);
    onRefresh();
  };

  const getGroupName = (groupId: number): string => {
    const group = groups.find(g => g.group.id === groupId);
    return group?.group.title || "";
  };

  const getDueStatus = (item: TodoItem): { label: string; urgent: boolean } | null => {
    if (!item.dueAt) return null;
    const now = Date.now();
    if (item.dueAt < now) {
      return { label: `逾期 ${dayjs(item.dueAt).fromNow(true)}`, urgent: true };
    }
    const diff = item.dueAt - now;
    if (diff < 86400000) {
      return { label: "今日截止", urgent: true };
    }
    return { label: dayjs(item.dueAt).fromNow(), urgent: false };
  };

  return (
    <div
      className={classNames(
        "flex min-h-[200px] flex-col rounded-xl border p-4",
        themeColors.cardBorderClass,
        themeColors.cardBgClass
      )}
    >
      {/* 标题行 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              themeColors.iconBgClass
            )}
          >
            <CheckSquare className={classNames("h-4 w-4", themeColors.iconTextClass)} />
          </div>
          <h3 className={classNames("text-sm font-semibold", themeColors.textClass)}>待办任务</h3>
          {pendingTotal > 0 && (
            <span
              className={classNames(
                "rounded-full px-1.5 py-0.5 text-xs font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass
              )}
            >
              {pendingTotal}
            </span>
          )}
          {overdueTotal > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {overdueTotal} 逾期
            </span>
          )}
        </div>
        <button
          onClick={() => createTab(TabType.Todo)}
          className={classNames(
            "flex cursor-pointer items-center gap-1 text-xs transition-colors",
            themeColors.secondaryTextClass,
            "hover:opacity-80"
          )}
        >
          查看全部
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* 列表 */}
      {items.length === 0 ? (
        <div
          className={classNames(
            "flex flex-1 items-center justify-center text-sm",
            themeColors.secondaryTextClass
          )}
        >
          没有待办任务 🎉
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {previewItems.map(item => {
            const dueStatus = getDueStatus(item);
            return (
              <div
                key={item.id}
                className={classNames(
                  "group flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                  themeColors.hoverClass
                )}
                onClick={() => createTab(TabType.Todo)}
              >
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleToggle(item);
                  }}
                  className="mt-0.5 shrink-0 cursor-pointer"
                >
                  {item.isCompleted ? (
                    <CheckCircle2 className="text-status-success h-4 w-4" />
                  ) : dueStatus?.urgent ? (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Circle className={classNames("h-4 w-4", themeColors.secondaryTextClass)} />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={classNames(
                      "truncate text-sm",
                      item.isCompleted ? "line-through opacity-50" : "",
                      themeColors.textClass
                    )}
                  >
                    {item.title}
                  </p>
                  <div className="mt-0.5 flex min-h-4 items-center gap-2">
                    {getGroupName(item.groupId) && (
                      <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
                        {getGroupName(item.groupId)}
                      </span>
                    )}
                    {dueStatus && (
                      <span
                        className={classNames(
                          "text-xs",
                          dueStatus.urgent
                            ? "font-medium text-red-500 dark:text-red-400"
                            : themeColors.secondaryTextClass
                        )}
                      >
                        {dueStatus.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TodoPanel;
