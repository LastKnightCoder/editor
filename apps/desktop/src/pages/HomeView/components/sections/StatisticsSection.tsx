import React from "react";
import ContentStatsCard from "../statistics/ContentStatsCard";
import KnowledgeStatsCard from "../statistics/KnowledgeStatsCard";
import TaskStatsCard from "../statistics/TaskStatsCard";
import StudyStatsCard from "../statistics/StudyStatsCard";
import StatCard from "../shared/StatCard";
import ActivityHeatmap from "../shared/ActivityHeatmap";
import { Activity } from "lucide-react";

interface StatisticsSectionProps {
  contentStats: {
    cardCount: number;
    articleCount: number;
    documentCount: number;
    totalWordCount: number;
  };
  knowledgeStats: {
    projectCount: number;
    whiteboardCount: number;
    tagCount: number;
  };
  taskStats: {
    todoTotal: number;
    todoCompleted: number;
    questionTotal: number;
    questionAnswered: number;
  };
  studyStats: {
    deckCount: number;
    cardCount: number;
    reviewsThisWeek: number;
    pomodoroTimeToday: number;
    pomodoroTimeWeek: number;
    eventsThisWeek: number;
  };
  activityHeatmap: Record<string, number>;
}

const StatisticsSection: React.FC<StatisticsSectionProps> = ({
  contentStats,
  knowledgeStats,
  taskStats,
  studyStats,
  activityHeatmap,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ContentStatsCard stats={contentStats} />
        <KnowledgeStatsCard stats={knowledgeStats} />
        <TaskStatsCard stats={taskStats} />
        <StudyStatsCard stats={studyStats} activityHeatmap={activityHeatmap} />
      </div>

      <StatCard title="活动热力图" icon={<Activity className="w-5 h-5" />}>
        <ActivityHeatmap data={activityHeatmap} />
      </StatCard>
    </div>
  );
};

export default StatisticsSection;
