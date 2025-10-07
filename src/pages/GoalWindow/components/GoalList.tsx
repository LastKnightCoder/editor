import { memo } from "react";

import { IGoal, EGoalStatus } from "@/types";
import GoalSection from "./GoalSection";

interface GoalListProps {
  goals: IGoal[];
  loading: boolean;
  selectedGoalId?: number;
  collapsedSections: Record<EGoalStatus, boolean>;
  onCreateGoal: () => void;
  onGoalSelect: (goal: IGoal) => void;
  onEditGoal: (goal: IGoal) => void;
  onDeleteGoal: (goal: IGoal) => void;
  onUpdateGoalStatus: (goal: IGoal, status: EGoalStatus) => void;
  onToggleSection: (status: EGoalStatus) => void;
}

const GoalList = memo(
  ({
    goals,
    loading,
    selectedGoalId,
    collapsedSections,
    onCreateGoal,
    onGoalSelect,
    onEditGoal,
    onDeleteGoal,
    onUpdateGoalStatus,
    onToggleSection,
  }: GoalListProps) => {
    const inProgressGoals = goals.filter(
      (g) => g.status === EGoalStatus.InProgress,
    );
    const completedGoals = goals.filter(
      (g) => g.status === EGoalStatus.Completed,
    );
    const abandonedGoals = goals.filter(
      (g) => g.status === EGoalStatus.Abandoned,
    );

    return (
      <div className="h-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        <div className="py-8 px-6 border-b border-gray-100 dark:border-zinc-800">
          <h2 className="m-0 text-gray-900 dark:text-gray-100 text-2xl font-bold tracking-tight">
            进度管理
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <GoalSection
            status={EGoalStatus.InProgress}
            goals={inProgressGoals}
            isCollapsed={collapsedSections[EGoalStatus.InProgress]}
            loading={loading}
            selectedGoalId={selectedGoalId}
            onToggleCollapse={() => onToggleSection(EGoalStatus.InProgress)}
            onGoalSelect={onGoalSelect}
            onEditGoal={onEditGoal}
            onDeleteGoal={onDeleteGoal}
            onUpdateGoalStatus={onUpdateGoalStatus}
            onCreateGoal={onCreateGoal} // 只传递给进行中的section
          />

          <GoalSection
            status={EGoalStatus.Completed}
            goals={completedGoals}
            isCollapsed={collapsedSections[EGoalStatus.Completed]}
            loading={loading}
            selectedGoalId={selectedGoalId}
            onToggleCollapse={() => onToggleSection(EGoalStatus.Completed)}
            onGoalSelect={onGoalSelect}
            onEditGoal={onEditGoal}
            onDeleteGoal={onDeleteGoal}
            onUpdateGoalStatus={onUpdateGoalStatus}
          />

          <GoalSection
            status={EGoalStatus.Abandoned}
            goals={abandonedGoals}
            isCollapsed={collapsedSections[EGoalStatus.Abandoned]}
            loading={loading}
            selectedGoalId={selectedGoalId}
            onToggleCollapse={() => onToggleSection(EGoalStatus.Abandoned)}
            onGoalSelect={onGoalSelect}
            onEditGoal={onEditGoal}
            onDeleteGoal={onDeleteGoal}
            onUpdateGoalStatus={onUpdateGoalStatus}
          />
        </div>
      </div>
    );
  },
);

export default GoalList;
