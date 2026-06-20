import React from "react";
import StatCard from "../shared/StatCard";
import RecentActivity from "../quick-access/RecentActivity";
import AlertsAndReminders from "../quick-access/AlertsAndReminders";
import CompactModuleGrid from "../quick-access/CompactModuleGrid";
import { Clock, Bell, Grid3x3 } from "lucide-react";

interface QuickAccessSectionProps {
  recentActivity: {
    cards: any[];
    articles: any[];
    projectItems: any[];
    documentItems: any[];
  };
  alerts: {
    todosDueToday: number;
    todosOverdue: number;
    flashcardsDue: number;
    fleetingNotes: number;
    rssUnread: number;
    questionsUnanswered: number;
  };
}

const QuickAccessSection: React.FC<QuickAccessSectionProps> = ({
  recentActivity,
  alerts,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
      <StatCard title="最近活动" icon={<Clock className="w-5 h-5" />}>
        <RecentActivity recentActivity={recentActivity} />
      </StatCard>

      <StatCard title="提醒事项" icon={<Bell className="w-5 h-5" />}>
        <AlertsAndReminders alerts={alerts} />
      </StatCard>

      <StatCard title="快捷入口" icon={<Grid3x3 className="w-5 h-5" />}>
        <CompactModuleGrid />
      </StatCard>
    </div>
  );
};

export default QuickAccessSection;
