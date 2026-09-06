import { typeLabelMap } from "./constants";
import { formatTime, isOverdue, getSecondaryInfoItems } from "./utils";
import Tooltip from "./Tooltip";
import type { TodoRowCardProps } from "./types";

const TodoRowCard = ({ item, isDark, onToggleComplete }: TodoRowCardProps) => {
  const overdueStatus = isOverdue(item);
  const secondaryInfoItems = getSecondaryInfoItems(item);

  return (
    <div className="flex items-start gap-3">
      <button
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
          item.isCompleted
            ? "bg-status-success text-white"
            : "border border-slate-300 hover:border-[var(--th-success)] dark:border-slate-600"
        }`}
        onClick={() => void onToggleComplete(item)}
        aria-label={item.isCompleted ? "标记为未完成" : "标记为已完成"}
      >
        {item.isCompleted && (
          <svg
            className="animate-fadeIn h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 6.5L5 9L9.5 3.5" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`min-w-0 flex-1 text-base font-medium ${
              item.isCompleted ? "line-through opacity-60" : ""
            } ${isDark ? "text-slate-50" : "text-slate-900"}`}
          >
            {item.title}
          </div>
          <div
            className={`rounded px-1 py-0.5 text-[10px] ${
              item.type === "recurring"
                ? isDark
                  ? "bg-purple-500/20 text-purple-300"
                  : "bg-purple-100 text-purple-700"
                : isDark
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            {typeLabelMap[item.type]}
          </div>
          {secondaryInfoItems.map((info, index) => (
            <Tooltip key={index} content={info.tooltip} isDark={isDark}>
              <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {info.icon} {info.text}
              </span>
            </Tooltip>
          ))}
        </div>

        {overdueStatus && (
          <div className="mt-1 text-sm font-medium text-rose-500">
            逾期：{formatTime(item.dueAt)}
          </div>
        )}

        <div className={`mt-1 text-xs opacity-60 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          {[
            item.group?.title ?? item.groupId,
            item.dueAt ? formatTime(item.dueAt) : null,
            formatTime(item.updateTime),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>

        {item.descriptionMarkdown ? (
          <div
            className={`mt-3 line-clamp-2 text-xs opacity-50 ${
              isDark ? "text-slate-400" : "text-slate-600"
            }`}
          >
            {item.descriptionMarkdown}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TodoRowCard;
