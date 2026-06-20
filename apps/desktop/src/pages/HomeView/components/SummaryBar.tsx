import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { CheckSquare, Brain, Rss, Timer } from "lucide-react";

interface SummaryBarProps {
  pendingTodos: number;
  overdueTodos: number;
  flashcardsDue: number;
  rssUnread: number;
  pomodoroToday: { count: number; focusMs: number };
}

const SummaryBar: React.FC<SummaryBarProps> = ({
  pendingTodos,
  overdueTodos,
  flashcardsDue,
  rssUnread,
  pomodoroToday,
}) => {
  const themeColors = useThemeColors();

  const formatFocusTime = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  };

  const items: { icon: React.ReactNode; label: string; highlight?: boolean }[] =
    [];

  if (pendingTodos > 0) {
    items.push({
      icon: <CheckSquare className="w-3.5 h-3.5" />,
      label: `${pendingTodos} 个待办`,
      highlight: overdueTodos > 0,
    });
  }
  if (overdueTodos > 0) {
    items.push({
      icon: <CheckSquare className="w-3.5 h-3.5" />,
      label: `${overdueTodos} 个逾期`,
      highlight: true,
    });
  }
  if (flashcardsDue > 0) {
    items.push({
      icon: <Brain className="w-3.5 h-3.5" />,
      label: `${flashcardsDue} 张待复习`,
    });
  }
  if (rssUnread > 0) {
    items.push({
      icon: <Rss className="w-3.5 h-3.5" />,
      label: `${rssUnread} 条未读`,
    });
  }
  if (pomodoroToday.focusMs > 0) {
    items.push({
      icon: <Timer className="w-3.5 h-3.5" />,
      label: `今日专注 ${formatFocusTime(pomodoroToday.focusMs)}`,
    });
  }

  if (items.length === 0) {
    return (
      <p className={classNames("text-base", themeColors.secondaryTextClass)}>
        一切井井有条，继续保持 ✨
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item, index) => (
        <span
          key={index}
          className={classNames(
            "inline-flex items-center gap-1.5 text-sm",
            item.highlight
              ? "text-red-500 dark:text-red-400 font-medium"
              : themeColors.secondaryTextClass,
          )}
        >
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  );
};

export default SummaryBar;
