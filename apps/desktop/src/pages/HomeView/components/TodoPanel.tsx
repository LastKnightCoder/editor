import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import {
  CheckSquare,
  ArrowRight,
  Circle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
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
    const group = groups.find((g) => g.group.id === groupId);
    return group?.group.title || "";
  };

  const getDueStatus = (
    item: TodoItem,
  ): { label: string; urgent: boolean } | null => {
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
        "rounded-xl border p-4 h-[260px] flex flex-col",
        themeColors.cardBorderClass,
        themeColors.cardBgClass,
      )}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              themeColors.iconBgClass,
            )}
          >
            <CheckSquare
              className={classNames("w-4 h-4", themeColors.iconTextClass)}
            />
          </div>
          <h3
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            待办任务
          </h3>
          {pendingTotal > 0 && (
            <span
              className={classNames(
                "text-xs px-1.5 py-0.5 rounded-full font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass,
              )}
            >
              {pendingTotal}
            </span>
          )}
          {overdueTotal > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {overdueTotal} 逾期
            </span>
          )}
        </div>
        <button
          onClick={() => createTab(TabType.Todo)}
          className={classNames(
            "text-xs flex items-center gap-1 transition-colors",
            themeColors.secondaryTextClass,
            "hover:opacity-80",
          )}
        >
          查看全部
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* 列表 */}
      {items.length === 0 ? (
        <div
          className={classNames(
            "flex-1 flex items-center justify-center text-sm",
            themeColors.secondaryTextClass,
          )}
        >
          没有待办任务 🎉
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-hidden min-h-0">
          {previewItems.map((item) => {
            const dueStatus = getDueStatus(item);
            return (
              <div
                key={item.id}
                className={classNames(
                  "group flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                  themeColors.hoverClass,
                )}
                onClick={() => createTab(TabType.Todo)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(item);
                  }}
                  className="mt-0.5 shrink-0"
                >
                  {item.isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : dueStatus?.urgent ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Circle
                      className={classNames(
                        "w-4 h-4",
                        themeColors.secondaryTextClass,
                      )}
                    />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={classNames(
                      "text-sm truncate",
                      item.isCompleted ? "line-through opacity-50" : "",
                      themeColors.textClass,
                    )}
                  >
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 min-h-4">
                    {getGroupName(item.groupId) && (
                      <span
                        className={classNames(
                          "text-xs",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {getGroupName(item.groupId)}
                      </span>
                    )}
                    {dueStatus && (
                      <span
                        className={classNames(
                          "text-xs",
                          dueStatus.urgent
                            ? "text-red-500 dark:text-red-400 font-medium"
                            : themeColors.secondaryTextClass,
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
