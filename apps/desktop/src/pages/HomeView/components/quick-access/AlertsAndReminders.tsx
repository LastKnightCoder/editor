import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import {
  CheckSquare,
  Brain,
  FileText,
  Rss,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

interface AlertItemProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  onClick: () => void;
  color?: string;
}

const AlertItem: React.FC<AlertItemProps> = ({
  icon,
  title,
  count,
  onClick,
  color,
}) => {
  const themeColors = useThemeColors();

  if (count === 0) return null;

  return (
    <div
      onClick={onClick}
      className={classNames(
        "group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors",
        "border",
        themeColors.cardBorderClass,
        themeColors.hoverClass,
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={classNames(
            "w-12 h-12 rounded-lg flex items-center justify-center",
            color || "bg-gray-100 dark:bg-gray-800",
          )}
        >
          <div className={themeColors.textClass}>{icon}</div>
        </div>
        <span
          className={classNames("text-base font-medium", themeColors.textClass)}
        >
          {title}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span
          className={classNames("text-3xl font-bold", themeColors.textClass)}
        >
          {count}
        </span>
        <ArrowRight
          className={classNames(
            "w-5 h-5 transition-transform group-hover:translate-x-1",
            themeColors.secondaryTextClass,
          )}
        />
      </div>
    </div>
  );
};

interface AlertsAndRemindersProps {
  alerts: {
    todosDueToday: number;
    todosOverdue: number;
    flashcardsDue: number;
    fleetingNotes: number;
    rssUnread: number;
    questionsUnanswered: number;
  };
}

const AlertsAndReminders: React.FC<AlertsAndRemindersProps> = ({ alerts }) => {
  const { createTab } = useTabStore();
  const themeColors = useThemeColors();

  const totalAlerts =
    alerts.todosDueToday +
    alerts.todosOverdue +
    alerts.flashcardsDue +
    alerts.fleetingNotes +
    alerts.rssUnread +
    alerts.questionsUnanswered;

  if (totalAlerts === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">✨</div>
        <div
          className={classNames(
            "text-xl font-light",
            themeColors.secondaryTextClass,
          )}
        >
          一切井井有条
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AlertItem
        icon={<CheckSquare className="w-6 h-6" />}
        title="今日待办"
        count={alerts.todosDueToday}
        onClick={() => createTab(TabType.Todo)}
      />
      <AlertItem
        icon={<CheckSquare className="w-6 h-6" />}
        title="逾期任务"
        count={alerts.todosOverdue}
        onClick={() => createTab(TabType.Todo)}
      />
      <AlertItem
        icon={<Brain className="w-6 h-6" />}
        title="待复习"
        count={alerts.flashcardsDue}
        onClick={() => createTab(TabType.FlashcardCenter)}
      />
      <AlertItem
        icon={<FileText className="w-6 h-6" />}
        title="闪念笔记"
        count={alerts.fleetingNotes}
        onClick={() => createTab(TabType.CardList)}
      />
      <AlertItem
        icon={<Rss className="w-6 h-6" />}
        title="未读订阅"
        count={alerts.rssUnread}
        onClick={() => createTab(TabType.RssSubscription)}
      />
      <AlertItem
        icon={<HelpCircle className="w-6 h-6" />}
        title="待解决"
        count={alerts.questionsUnanswered}
        onClick={() => createTab(TabType.Questions)}
      />
    </div>
  );
};

export default AlertsAndReminders;
