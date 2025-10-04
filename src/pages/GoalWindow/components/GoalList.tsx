import { memo } from "react";

import { IGoal, EGoalStatus } from "@/types";
import GoalSection from "./GoalSection";
import styles from "../index.module.less";

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
  onNoteChange?: () => void; // 笔记变化回调
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
    onNoteChange,
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
      <div className={styles.leftPanel}>
        <div className={styles.panelHeader}>
          <h2>进度管理</h2>
        </div>

        <div className={styles.goalSections}>
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
            onNoteChange={onNoteChange}
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
            onNoteChange={onNoteChange}
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
            onNoteChange={onNoteChange}
          />
        </div>
      </div>
    );
  },
);

export default GoalList;
